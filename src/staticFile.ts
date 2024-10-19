import {AddClient, type FileInfo, MarkdownToHtml} from './html.js';
import type {Http2ServerRequest, Http2ServerResponse, OutgoingHttpHeaders} from 'node:http2';
import type {RequiredHostOptions} from './opts.js';
import type {Stats} from 'node:fs';
import type {WatchSet} from './watchSet.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import mt from 'mime-types';
import path from 'node:path';

export interface ServerState {
  base: string;
  baseURL: URL;
  watcher: WatchSet;
  headers: OutgoingHttpHeaders;
}

const FAVICON = 'favicon.ico';
const S_FAVICON = `/${FAVICON}`;
const assets = new URL('../assets/', import.meta.url);
const F_FAVICON = fileURLToPath(new URL(FAVICON, assets));

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
  req: Http2ServerRequest,
  res: Http2ServerResponse
): Promise<number> {
  function error(code: number, text: string): number {
    res.writeHead(code, state.headers).end(`${text}\n`);
    return code;
  }

  try {
    if (req.method !== 'GET') {
      return error(405, `Method ${req.method} not supported`);
    }

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
      return error(403, 'Invalid path');
    } else {
      fh = await fs.open(file);
    }

    let stat = await fh.stat();
    if (stat.isDirectory()) {
      await fh.close();
      [file, fh, stat] = await findExistingFile(file, opts.index);
    }

    // Even if we 304, some client is waiting for updates on this file.
    // e.g. reconnect
    state.watcher.add(file);

    // Same alg as nginx
    const etag = `${stat.mtime.getTime().toString(16)}-${stat.size.toString(16)}`;
    if (req.headers['if-none-match'] === etag) {
      fh.close();
      return error(304, 'Not Modified');
    }

    const info: FileInfo = {
      file,
      pathname,
      size: stat.size,
      stream: fh.createReadStream(),
    };

    let mime = mt.lookup(info.file) || 'text/plain';
    if ((mime === 'text/markdown') && !opts.rawMarkdown) {
      info.stream = info.stream.pipe(new MarkdownToHtml(info));
      mime = 'text/html';
    }
    if (mime === 'text/html') {
      info.stream = info.stream.pipe(new AddClient(info));
    }

    const headers: OutgoingHttpHeaders = {
      ...state.headers,
      'Content-Type': mime,
      etag,
    };
    if (info.size) {
      headers['Content-Length'] = info.size; // Otherwise chunked
    }
    res.writeHead(200, headers);
    info.stream.pipe(res);
    return 200;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return error(404, `No such file: "${req.url}"`);
    }
    return error(500, err.message);
  }
}
