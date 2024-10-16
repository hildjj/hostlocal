/* eslint-disable no-console */
import {type HostOptions, normalizeOptions} from './opts.js';
import {addClientScript, markdownToHTML} from './html.js';
import {name as pkgName, version as pkgVersion} from './version.js';
import type {AddressInfo} from 'node:net';
import {DebounceSet} from './debounce.js';
import {WatchGlob} from './watchGlob.js';
import {WebSocketServer} from 'ws';
import chokidar from 'chokidar';
import {createCert} from './cert.js';
import fs from 'node:fs/promises';
import http2 from 'node:http2';
import mt from 'mime-types';
import open from 'open';
import path from 'node:path';

export type {HostOptions, EmptyCallback, ListenCallback} from './opts.js';

function log(
  opts: Required<HostOptions>,
  req: http2.Http2ServerRequest | string
): void {
  if (!opts.quiet) {
    console.log(
      new Date()
        .toLocaleString('sv')
        .replace(' ', 'T'),
      typeof req === 'string' ? req : req.url
    );
  }
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

function notify(wss: WebSocketServer, urls: string[]): void {
  const msg = JSON.stringify({
    type: 'change',
    urls,
  });
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}

/**
 * Server a directory via HTTPS.
 *
 * @param root Root directory to serve from.
 * @param options Options.
 */
export async function hostLocal(
  root: string,
  options: HostOptions
): Promise<void> {
  const opts = await normalizeOptions(options);

  const Server = `${pkgName}/${pkgVersion}`;
  const watcher = chokidar.watch([], {
    atomic: true,
    ignoreInitial: true,
  });

  const base = await fs.realpath(root);
  const cert = await createCert(opts);
  const server = http2.createSecureServer({
    ...cert,
    allowHTTP1: true,
  }, async(req, res) => {
    let buf = null;
    let file = null;
    try {
      // TODO: log response code
      log(opts, req);

      file = await fs.realpath(path.resolve(path.join(base, req.url ?? '')));
      if (!file.startsWith(base)) {
        res.writeHead(403, 'Forbidden');
        res.end('Invalid path');
        return;
      }
      const stat = await fs.stat(file);

      if (stat.isDirectory()) {
        file = await findExistingFile(file, opts.index);
      }
      buf = await fs.readFile(file);
      watcher.add(file);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        res.writeHead(404, 'File not found');
        res.end(`No such file: "${req.url}"\n`);
      } else {
        res.writeHead(500, 'Internal Server Error');
        res.end((e as Error).message);
      }
      return;
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

        buf = markdownToHTML(buf, req.url);
        mime = 'text/html';
        break;
      }
      default:
        break;
    }
    res.writeHead(200, {
      Server,
      'Content-Length': buf.length,
      'Content-Type': mime,
    });
    res.end(buf);
  }).listen(opts.port, 'localhost', () => {
    const {port} = server.address() as AddressInfo;
    const url = `https://localhost:${port}/`;
    log(opts, `Listening on ${url}`);
    if (opts.open) {
      // Ignore promise
      open(new URL(opts.open, url).toString());
    }
    if (opts.onListen) {
      opts.onListen.call(server, url);
    }
  });

  if (opts.onClose) {
    server.on('close', opts.onClose);
  }

  // @ts-expect-error See https://github.com/websockets/ws/issues/1458
  const wss = new WebSocketServer({server});
  wss.on('connection', ws => {
    ws.on('error', (er: Error) => log(opts, er.message));
    ws.on('message', msg => {
      const jmsg = JSON.parse(msg.toString());
      switch (jmsg?.type) {
        case 'shutdown':
          // Completely insecure when shutTimes < Infinity.
          // Only set shutTimes when testing.
          if (--opts.shutTimes <= 0) {
            process.exit(0);
          }
          break;
        default:
          // Ignored
          break;
      }
    });
  });

  const notifySet = new DebounceSet((paths: string[]) => {
    const urls =
      paths.map(f => `https://localhost:${opts.port}/${path.relative(root, f)}`);
    notify(wss, urls);
  }, 100, opts.signal);

  watcher.on('change', f => {
    notifySet.add(f);
  });

  watcher.on('add', f => {
    notifySet.add(f);
  });

  watcher.on('unlink', f => {
    watcher.add(f);
  });

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => {
      watcher.close();
      server.close();
    });
  }

  if (opts.glob?.length) {
    for (const glob of opts.glob) {
      const wg = new WatchGlob({
        glob,
        shellCommand: opts.exec,
        signal: opts.signal,
      });
      await wg.start();
    }
  }
}
