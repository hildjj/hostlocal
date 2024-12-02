import {AddClient, type FileInfo, MarkdownToHtml} from './html.js';
import {CGI} from './cgi.js';
import type {Logger} from 'pino';
import type {RequiredHostOptions} from './opts.js';
import type {Stats} from 'node:fs';
import type {WatchSet} from './watchSet.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import http2 from 'node:http2';
import mt from 'mime-types';
import {parse} from '@cto.af/http-headers';
import path from 'node:path';
import {pipeline} from 'node:stream';

export interface ServerState {
  base: string;
  baseURL: URL;
  watcher: WatchSet;
  headers: http2.OutgoingHttpHeaders;
}

const FAVICON = 'favicon.ico';
const S_FAVICON = `/${FAVICON}`;
const assets = new URL('../assets/', import.meta.url);
const F_FAVICON = fileURLToPath(new URL(FAVICON, assets));
const IS_HTML = /\btext\/html\b/;

export const {
  HTTP_STATUS_FORBIDDEN: FORBIDDEN,
  HTTP_STATUS_INTERNAL_SERVER_ERROR: INTERNAL_SERVER_ERROR,
  HTTP_STATUS_METHOD_NOT_ALLOWED: METHOD_NOT_ALLOWED,
  HTTP_STATUS_NOT_FOUND: NOT_FOUND,
  HTTP_STATUS_NOT_MODIFIED: NOT_MODIFIED,
  HTTP_STATUS_OK: OK,
  HTTP_STATUS_NO_CONTENT: NO_CONTENT,
  HTTP_STATUS_MOVED_PERMANENTLY: MOVED_PERMANENTLY,
} = http2.constants;

async function findExistingFile(
  dir: string,
  possible: string[]
): Promise<[string, fs.FileHandle, Stats]> {
  for (const p of possible) {
    try {
      const file = path.join(dir, p);
      const fh = await fs.open(file);
      const stat = await fh.stat();
      if (stat.isFile()) {
        return [file, fh, stat];
      }
      fh.close();
    } catch (_ignored) {
      // Ignored
    }
  }
  const er = new Error('No index file found') as NodeJS.ErrnoException;
  er.code = 'ENOENT';
  throw er;
}

/**
 * Work-around for timing issue during debugging.  Exported for testing only.
 *
 * @param log Logger.
 * @param error Possibly an error, usually null.
 */
export function __debugError(
  log: Logger,
  error: NodeJS.ErrnoException | null
): void {
  if (error) {
    log.debug(error.message);
  }
}

/**
 * Actually serve the file, if found.
 *
 * @param opts Options.
 * @param state Server state.
 * @param req Request.
 * @param res Response.
 * @returns Status code sent, for logging.
 */
export async function staticFile(
  opts: RequiredHostOptions,
  state: ServerState,
  req: http2.Http2ServerRequest,
  res: http2.Http2ServerResponse
): Promise<number> {
  function error(
    code: number,
    text: string,
    headers?: http2.OutgoingHttpHeaders
  ): number {
    res.writeHead(code, {
      ...state.headers,
      ...headers,
    }).end(`${text}\n`);
    return code;
  }

  try {
    const url = new URL(req.url, state.baseURL);
    const {pathname} = url;

    const relative = path.relative(state.baseURL.pathname, pathname);
    let file = path.resolve(path.join(state.base, relative));
    let fh: fs.FileHandle | undefined = undefined;

    if (req.url === S_FAVICON) {
      try {
        // If there is one in the base dir, use it.
        file = path.join(state.base, FAVICON);
        fh = await fs.open(file);
      } catch (_ignored) {
        // Otherwise fall back on the one in assets.
        file = F_FAVICON;
        fh = await fs.open(file);
      }
    } else if (relative.startsWith('..')) {
      // Paths can be bad from the client, or bad because of symlinks.
      // Since this is a dev server, we're going to serve symlinks even if
      // they point outside the root directory.
      return error(FORBIDDEN, 'Invalid path');
    } else {
      fh = await fs.open(file);
    }

    let stat = await fh.stat();
    if (stat.isDirectory()) {
      await fh.close();
      if (req.url.endsWith('/')) {
        [file, fh, stat] = await findExistingFile(file, opts.index);
      } else {
        // Without the trailing /, all relative URLs gonna puke.
        return error(MOVED_PERMANENTLY, 'Moved Permanently', {
          location: `${req.url}/`,
        });
      }
    }

    // Even if we 304, some client is waiting for updates on this file.
    // e.g. reconnect
    state.watcher.add(file);

    let mime = mt.lookup(file) || 'text/plain';
    // Same alg as nginx.  MUST have dquotes.
    const etag = `"${stat.mtime.getTime().toString(16)}-${stat.size.toString(16)}"`;
    const headers: http2.OutgoingHttpHeaders = {
      ...state.headers,
      'content-type': mime,
      etag,
      'last-modified': new Date(stat.mtime).toUTCString(),
    };
    const hinm = req.headers['if-none-match'];
    const inm = hinm ? new Set(parse(hinm, {startRule: 'If_None_Match'}).etags) : null;
    if (inm) {
      if (inm.has(etag)) {
        fh.close();
        return error(NOT_MODIFIED, 'Not Modified', headers);
      }
    } else if (req.headers['if-modified-since']) {
      const ims = new Date(req.headers['if-modified-since']);
      const lm = new Date(stat.mtime.getTime());
      lm.setMilliseconds(0);
      if (ims >= lm) {
        return error(NOT_MODIFIED, 'Not Modified', headers);
      }
    }

    if (req.method === 'HEAD') {
      // No content-length, because we don't want to open the file yet.
      // https://httpwg.org/specs/rfc9110.html#HEAD says that's ok.
      return error(OK, '', headers);
    }

    const info: FileInfo = {
      file,
      url,
      headers,
      size: stat.size,
      signal: opts.signal,
      dir: opts.dir,
      log: opts.log,
    };

    const cgi = opts.CGI[mime];
    if (cgi) {
      fh.close();
      opts.log.debug('Executing %s => "%s"', mime, cgi);
      const add = new AddClient(info, false);
      const c = new CGI(req, cgi, info);
      c.on('headers', () => {
        let ct = info.headers['content-type'];
        if (!ct) {
          ct = 'application/text';
          info.headers['content-type'] = ct;
        }
        if (IS_HTML.test(ct)) {
          add.append = true;
        }
        res.writeHead(OK, info.headers);
      });
      pipeline(req, c, add, res, __debugError.bind(null, opts.log));
      return OK;
    }

    switch (req.method) {
      case 'OPTIONS':
        fh.close();
        return error(NO_CONTENT, '', {allow: 'GET, HEAD, OPTIONS'});
      case 'GET':
        break;
      default:
        fh.close();
        return error(METHOD_NOT_ALLOWED, `Method ${req.method} not supported`);
    }

    const transforms: (
      NodeJS.ReadableStream |
      NodeJS.WritableStream |
      NodeJS.ReadWriteStream
    )[] = [];

    if ((mime === 'text/markdown') && !opts.rawMarkdown) {
      transforms.push(new MarkdownToHtml(info));
      mime = 'text/html';
      headers['content-type'] = mime;
    }
    if (opts.script && IS_HTML.test(mime)) {
      transforms.push(new AddClient(info));
    }

    if (info.size) {
      headers['content-length'] = info.size; // Otherwise chunked
    }
    transforms.unshift(fh.createReadStream());
    transforms.push(res);
    res.writeHead(OK, headers);
    // Don't use the promise version of this. The promise will resolve after
    // the stream ends, which means it will dangle in the tests.
    pipeline(transforms, __debugError.bind(null, opts.log));
    return OK;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return error(NOT_FOUND, `No such file: "${req.url}"`);
    }
    opts.log.warn('Uncaught error: %s', err.message);
    return error(INTERNAL_SERVER_ERROR, err.message);
  }
}
