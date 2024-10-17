import {AddClient, type FileInfo, MarkdownToHtml} from './html.js';
import type {Http2ServerRequest, Http2ServerResponse, OutgoingHttpHeaders} from 'node:http2';
import type {FSWatcher} from 'chokidar';
import type {RequiredHostOptions} from './opts.js';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import mt from 'mime-types';
import ofs from 'node:fs';
import path from 'node:path';

export interface ServerState {
  base: string;
  baseURL: URL;
  watcher: FSWatcher;
  headers: OutgoingHttpHeaders;
}

async function findExistingFile(
  dir: string,
  possible: string[]
): Promise<string> {
  for (const p of possible) {
    try {
      const file = path.join(dir, p);
      const stat = await fs.stat(file);
      if (stat.isFile()) {
        return file;
      }
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
export async function serve(
  opts: RequiredHostOptions,
  state: ServerState,
  req: Http2ServerRequest,
  res: Http2ServerResponse
): Promise<number> {
  function error(code: number, text: string): number {
    res.writeHead(code, state.headers).end(`${text}\n`);
    return code;
  }

  let info: FileInfo | undefined = undefined;
  try {
    if (req.method !== 'GET') {
      return error(405, `Method ${req.method} not supported`);
    }

    const url = new URL(req.url, state.baseURL);
    const {pathname} = url;
    let file = await fs.realpath(path.resolve(path.join(state.base, pathname)));
    if (!file.startsWith(state.base)) {
      return error(403, 'Invalid path');
    }
    let stat = await fs.stat(file);
    if (stat.isDirectory()) {
      file = await findExistingFile(file, opts.index);
      stat = await fs.stat(file);
    }

    info = {
      file,
      pathname,
      size: stat.size,
    };
    info.stream = ofs.createReadStream(file);
    state.watcher.add(file);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return error(404, `No such file: "${req.url}"`);
    }
    return error(500, (e as Error).message);
  }
  assert(info);
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
  };
  if (info.size) {
    headers['Content-Length'] = info.size; // Otherwise chunked
  }
  res.writeHead(200, headers);
  info.stream.pipe(res);
  return 200;
}
