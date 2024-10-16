import type {Http2ServerRequest, Http2ServerResponse, OutgoingHttpHeaders} from 'node:http2';
import {addClientScript, markdownToHTML} from './html.js';
import type {FSWatcher} from 'chokidar';
import type {RequiredHostOptions} from './opts.js';
import fs from 'node:fs/promises';
import mt from 'mime-types';
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

  let buf = null;
  let file = null;
  let pathname = null;
  try {
    if (req.method !== 'GET') {
      return error(405, `Method ${req.method} not supported`);
    }

    const url = new URL(req.url, state.baseURL);
    ({pathname} = url);
    file = await fs.realpath(path.resolve(path.join(state.base, pathname)));
    if (!file.startsWith(state.base)) {
      return error(403, 'Invalid path');
    }
    const stat = await fs.stat(file);

    if (stat.isDirectory()) {
      file = await findExistingFile(file, opts.index);
    }
    buf = await fs.readFile(file);
    state.watcher.add(file);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return error(404, `No such file: "${pathname}"`);
    }
    return error(500, (e as Error).message);
  }
  let mime = mt.lookup(file) || 'text/plain';
  switch (mime) {
    case 'text/html':
      buf = addClientScript(buf);
      break;
    case 'text/markdown': {
      if (opts.rawMarkdown) {
        break;
      }

      buf = markdownToHTML(buf, pathname);
      mime = 'text/html';
      break;
    }
    default:
      break;
  }
  res.writeHead(200, {
    ...state.headers,
    'Content-Length': buf.length,
    'Content-Type': mime,
  }).end(buf);
  return 200;
}
