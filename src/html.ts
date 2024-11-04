import {type ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import {Readable, Transform, type TransformCallback} from 'node:stream';
import {name, version} from './version.js';
import {Buffer} from 'node:buffer';
import type {Logger} from 'pino';
import fs from 'node:fs/promises';
import type http2 from 'node:http2';
import markdownit from 'markdown-it';

export interface FileInfo {

  /** Fully-qualified path to file, resolved. */
  file: string;

  /** Request URL path portion. */
  url: URL;

  /**
   * Currently-know content-length for the file.
   * Undefined for chunked transfer encoding.
   */
  size?: number;

  /** Root directory. */
  dir: string;

  /** Signal to watch for shutdown. */
  signal?: AbortSignal | null;

  /** Modifiable set of headers for response. */
  headers: http2.OutgoingHttpHeaders;

  log: Logger;
}

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
});

// Pre-cache client JS
const clientSrc = await fs.readFile(
  new URL('./client.js', import.meta.url),
  'utf8'
);
const clientScriptString = `
<script type="module" id="hostlocal-client-script">
${clientSrc}
</script>
`;
const clientScriptBuffer = Buffer.from(clientScriptString);

/**
 * Add the client JS onto the end of an HTML stream.
 * Pass the original stream through until we get to the end, then tack on
 * the script.
 */
export class AddClient extends Transform {
  public constructor(info: FileInfo) {
    super();
    if (info.size) {
      info.size += clientScriptBuffer.length;
    }
  }

  public _transform(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.push(chunk, encoding);
    callback();
  }

  public _flush(callback: TransformCallback): void {
    this.push(clientScriptBuffer);
    callback();
  }
}

/**
 * Convert markdown to HTML in an overly-elaborate fashion.
 */
export class MarkdownToHtml extends Transform {
  static #encodedStringChunks: Buffer[] = [];
  #bufs: Buffer[] = [];
  #info: FileInfo;

  public constructor(info: FileInfo) {
    super();
    this.#info = info;
    // Can't pre-compute the size, since that is only known after conversion
    info.size = undefined;
  }

  /**
   * Template string tag function.  Alternate string and value.  Special
   * attention on the ends, were string might be '' or value might be
   * undefined.
   *
   * @param strings Static portions of the template.
   * @param values Results of blocks inserted into the template.
   * @yields Buffers to go into the stream.
   * @example
   * ```js
   * for (const buf of MarkdownToHtml.#encode`foo${bar}baz`) {
   *   this.push(buf); // Hopefully called exactly 3 times
   * }
   * ```
   */
  static *#encode(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Generator<Buffer, void, undefined> {
    for (let i = 0; i < strings.length; i++) {
      if (strings[i]) {
        let buf = MarkdownToHtml.#encodedStringChunks[i];
        if (!buf) {
          buf = Buffer.from(strings[i]);
          MarkdownToHtml.#encodedStringChunks[i] = buf;
        }
        yield buf;
      }
      if (values[i] != null) {
        const buf = Buffer.isBuffer(values[i]) ?
          values[i] as Buffer :
          Buffer.from(String(values[i]));
        yield buf;
      }
    }
  }

  public _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    // Store all of the chunks until we're done.
    this.#bufs.push(chunk as Buffer);
    callback();
  }

  public _flush(callback: TransformCallback): void {
    const mkd = Buffer.concat(this.#bufs).toString();
    const html = Buffer.from(md.render(mkd));

    for (const buf of MarkdownToHtml.#encode`\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this.#info.url.pathname}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.7.0/github-markdown-dark.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

  <style>
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }

    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
  </style>
</head>
<body class="markdown-body">
${html}
</body>
</html>
<script>hljs.highlightAll();</script>
`) {
      this.push(buf);
    }

    callback();
  }
}

enum ParseState {
  LINE_START = 0,
  VALUE = 1,
  NL = 2,
  CONTENT = 3,
}

/* eslint-disable @typescript-eslint/prefer-literal-enum-member */
enum Char {
  COLON = ':'.codePointAt(0) as number,
  CR = '\r'.codePointAt(0) as number,
  NL = '\n'.codePointAt(0) as number,
}
/* eslint-enable @typescript-eslint/prefer-literal-enum-member */

export class CGI extends Readable {
  #child: ChildProcessWithoutNullStreams;
  #state: ParseState = ParseState.LINE_START;
  #headerName: Buffer[] = [];
  #headerValue: Buffer[] = [];
  #headers: http2.OutgoingHttpHeaders;

  public constructor(
    req: http2.Http2ServerRequest | null,
    bin: string,
    info: FileInfo,
    ...args: string[]
  ) {
    super();
    this.#headers = info.headers;
    info.size = undefined;
    this.#child = spawn(bin, [info.file, ...args], {
      stdio: 'pipe',
      signal: info.signal ?? undefined,
      env: {
        ...process.env,
        DOCUMENT_ROOT: info.dir,
        GATEWAY_INTERFACE: 'CGI/1.1',
        HTTPS: 'on',
        PATH_INFO: info.url.pathname,
        PATH_TRANSLATED: info.file,
        QUERY_STRING: info.url.search.slice(1), // No "?"
        REDIRECT_STATUS: '200', // For php-cgi.  This is likely a problem.
        REMOTE_ADDR: req?.socket?.remoteAddress,
        REQUEST_METHOD: req?.method,
        SERVER_NAME: info.url.hostname,
        SERVER_PORT: info.url.port,
        SERVER_PROTOCOL: `HTTP/${req?.httpVersion || 1.1}`,
        SERVER_SOFTWARE: `${name} ${version}`,
      },
    });
    this.#child.stdout.on('data', buf => this.#parse(buf));
    this.#child.stderr.on('data', buf => info.log.debug('CGI: %s', buf));
    this.#child.on('exit', (code, signal) => {
      if (code) {
        this.destroy(new Error(`Invalid exit code from "${bin}": ${code}`));
      } else if (signal) {
        this.destroy(new Error(`"${bin}" received signal: ${signal}`));
      } else {
        this.push(null);
      }
    });
    this.#child.on('error', er => this.destroy(er));
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  public _read(_size: number): void {
    // No-op
  }

  #parse(buf: Buffer): void {
    const more = (pos: number): void => {
      const left = buf.subarray(pos + 1);
      if (left.length > 0) {
        this.#parse(left);
      }
    };
    switch (this.#state) {
      case ParseState.LINE_START: {
        if (buf[0] === Char.CR) {
          // End of headers
          this.#state = ParseState.NL;
          more(0);
          break;
        }
        const pos = buf.indexOf(Char.COLON);
        if (pos === -1) {
          this.#headerName.push(buf);
        } else {
          this.#headerName.push(buf.subarray(0, pos));
          this.#state = ParseState.VALUE;
          more(pos);
        }
        break;
      }
      case ParseState.VALUE: {
        const pos = buf.indexOf(Char.CR);
        if (pos === -1) {
          if (buf.indexOf(Char.NL) >= 0) {
            this.destroy(new Error('Invalid CR/NL in header'));
          }
          this.#headerValue.push(buf);
        } else {
          this.#headerValue.push(buf.subarray(0, pos));
          this.#state = ParseState.NL;
          more(pos);
        }
        break;
      }
      case ParseState.NL:
        if (buf[0] !== Char.NL) {
          this.destroy(new Error('Invalid CR/NL in header'));
        }
        if (this.#headerName.length > 0) {
          const nm = Buffer
            .concat(this.#headerName)
            .toString()
            .trim()
            .toLowerCase();
          const value = Buffer
            .concat(this.#headerValue)
            .toString()
            .trim();
          this.#headers[nm] = value;
          this.#headerName = [];
          this.#headerValue = [];
          this.#state = ParseState.LINE_START;
        } else {
          this.#state = ParseState.CONTENT;
          this.pause();
          this.emit('headers');
        }
        more(0);
        break;
      case ParseState.CONTENT:
        this.push(buf);
        break;
    }
  }
}
