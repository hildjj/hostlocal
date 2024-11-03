import {type ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import {Transform, type TransformCallback} from 'node:stream';
import {Buffer} from 'node:buffer';
import fs from 'node:fs/promises';
import markdownit from 'markdown-it';

const HTML = new Set([
  'text/html',
  'application/xhtml+xml',
]);

export interface FileInfo {

  /** Fully-qualified path to file, resolved. */
  file: string;

  /** Request URL path portion. */
  pathname: string;

  /**
   * Currently-know content-length for the file.
   * Undefined for chunked transfer encoding.
   */
  size?: number;

  /** Root directory. */
  dir: string;

  /** Signal to watch for shutdown. */
  signal?: AbortSignal | null;
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

const htmlEntities: {
  [entity: string]: string;
} = {
  '"': '&quot;',
  "'": '&apos;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};
function htmlEscape(buf: Buffer): Buffer {
  return Buffer.from(
    buf.toString().replace(/["'&<>]/g, c => htmlEntities[c])
  );
}

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
  <title>${this.#info.pathname}</title>
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

export class FilterStream extends Transform {
  #child: ChildProcessWithoutNullStreams;
  #cmd: string;
  #contentType: string;
  #error = false;

  public constructor(info: FileInfo, cmd: string, contentType: string) {
    super();
    // Can't pre-compute the size, since that is only known after conversion
    info.size = undefined;

    this.#cmd = cmd;
    this.#contentType = contentType;
    this.#child = spawn(cmd, [], {
      shell: true,
      stdio: 'pipe',
      cwd: info.dir,
      signal: info.signal ?? undefined,
    });
    this.#child.stdout.on('data', (chunk: Buffer) => {
      this.push(chunk);
    });
    this.#child.stderr.on('data', (chunk: Buffer) => {
      const html = HTML.has(this.#contentType);
      if (!this.#error) {
        // Once anything is written to stderr, switch to error mode.
        this.#error = true;
        if (html) {
          this.push(Buffer.from(`\
<!DOCTYPE html>
<html>
  <head>
    <title>Error in "${this.#cmd}"</title>
  </head>
  <body>
    <pre><code>
`));
        }
      }
      if (html) {
        chunk = htmlEscape(chunk);
      }
      this.push(chunk);
    });
    this.#child.on('error', er => this.destroy(er));
  }

  public _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.#child.stdin.write(chunk, callback);
  }

  public _flush(callback: TransformCallback): void {
    this.#child.once('exit', (code, signal) => {
      if (this.#error) {
        if (HTML.has(this.#contentType)) {
          this.push(`\
    </code></pre>
  </body>
</html>
`);
        }
      }
      if (code) {
        this.destroy(new Error(`Invalid exit code from "${this.#cmd}": ${code}`));
      } else if (signal) {
        this.destroy(new Error(`Died with signal "${this.#cmd}": ${signal}`));
      } else {
        callback();
      }
    });
    this.#child.stdin.end();
  }
}
