import {type ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import {Transform, type TransformCallback} from 'node:stream';
import {name, version} from './version.js';
import {Buffer} from 'node:buffer';
import type {FileInfo} from './html.js';
import type http2 from 'node:http2';

enum ParseState {
  LINE_START = 0,
  SPACE = 1,
  VALUE = 2,
  NL = 3,
  CONTENT = 4,
}

/* eslint-disable @typescript-eslint/prefer-literal-enum-member */
enum Char {
  COLON = ':'.codePointAt(0) as number,
  CR = '\r'.codePointAt(0) as number,
  NL = '\n'.codePointAt(0) as number,
  SPACE = ' '.codePointAt(0) as number,
}
/* eslint-enable @typescript-eslint/prefer-literal-enum-member */

export class CGI extends Transform {
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
        CONTENT_LENGTH: req?.headers['content-length'] ?? '0',
        CONTENT_TYPE: req?.headers['content-type'] ?? 'NULL',
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
    this.#child.stdout.on('data', buf => {
      this.#parse(buf);
    });
    this.#child.stderr.on('data', buf => info.log.debug('CGI: %s', buf));
    this.#child.on('exit', (code, signal) => {
      if (code) {
        this.destroy(new Error(`Invalid exit code from "${bin}": ${code}`));
      } else if (signal) {
        this.destroy(new Error(`"${bin}" received signal: ${signal}`));
      } else {
        super.push(null);
      }
    });
    this.#child.on('error', er => this.destroy(er));
  }

  public _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.#child.stdin.write(chunk, encoding, callback);
  }

  public _flush(callback: TransformCallback): void {
    this.#child.stdin.end(callback);
  }

  public push(chunk: Buffer, encoding?: BufferEncoding): boolean {
    // Ignore the push(null) that transform seems to want to do in the
    // wrong place when the writable side ends.
    if (chunk) {
      return super.push(chunk, encoding);
    }
    return true;
  }

  #parse(buf: Buffer): void {
    const len = buf.length;
    let offset = 0;
    function rest(): Buffer {
      return (offset === 0) ? buf : buf.subarray(offset);
    }

    while (offset < len) {
      switch (this.#state) {
        case ParseState.LINE_START: {
          if (buf[offset] === Char.CR) {
            // End of headers
            this.#state = ParseState.NL;
            offset++;
          } else {
            const pos = buf.indexOf(Char.COLON, offset);
            if (pos === -1) {
              this.#headerName.push(rest());
              offset = len + 1;
            } else {
              this.#headerName.push(buf.subarray(offset, pos));
              this.#state = ParseState.SPACE;
              offset = pos + 1;
            }
          }
          break;
        }
        case ParseState.SPACE:
          if (buf[offset] === Char.SPACE) {
            offset++;
          } else {
            this.#state = ParseState.VALUE;
          }
          break;
        case ParseState.VALUE: {
          const pos = buf.indexOf(Char.CR, offset);
          if (pos === -1) {
            if (buf.indexOf(Char.NL, offset) >= 0) {
              this.destroy(new Error('Invalid CR/NL in header'));
            }
            this.#headerValue.push(rest());
            offset = len + 1;
          } else {
            this.#headerValue.push(buf.subarray(offset, pos));
            this.#state = ParseState.NL;
            offset = pos + 1;
          }
          break;
        }
        case ParseState.NL:
          if (buf[offset] !== Char.NL) {
            this.destroy(new Error('Invalid CR/NL in header'));
          }
          if (this.#headerName.length > 0) {
            const nm = Buffer
              .concat(this.#headerName)
              .toString()
              .toLowerCase();
            const value = Buffer
              .concat(this.#headerValue)
              .toString();
            this.#headers[nm] = value;
            this.#headerName = [];
            this.#headerValue = [];
            this.#state = ParseState.LINE_START;
          } else {
            this.#state = ParseState.CONTENT;
            // Don't do anything async here...
            this.emit('headers');
          }
          offset++;
          break;
        case ParseState.CONTENT:
          this.push(rest());
          offset = len + 1;
          break;
      }
    }
  }
}
