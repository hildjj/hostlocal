/* eslint-disable no-console */
import {type HostOptions, normalizeOptions} from './opts.js';
import {type ServerState, serve} from './serve.js';
import {name as pkgName, version as pkgVersion} from './version.js';
import {DebounceSet} from './debounce.js';
import {WatchGlob} from './watchGlob.js';
import {WebSocketServer} from 'ws';
import chokidar from 'chokidar';
import {createCert} from './cert.js';
import fs from 'node:fs/promises';
import http2 from 'node:http2';
import open from 'open';
import path from 'node:path';

export type {HostOptions, EmptyCallback, ListenCallback} from './opts.js';

function log(opts: Required<HostOptions>, ...str: string[]): void {
  if (!opts.quiet) {
    const now = new Date()
      .toLocaleString('sv')
      .replace(' ', 'T');
    console.log(now, ...str);
  }
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

  const cert = await createCert(opts);
  const state: ServerState = {
    headers: {
      Server: `${pkgName}/${pkgVersion}`,
    },
    base: await fs.realpath(root),
    baseURL: new URL(`https://localhost:${opts.port}/`),
    watcher: chokidar.watch([], {
      atomic: true,
      ignoreInitial: true,
    }),
  };

  const server = http2.createSecureServer({
    ...cert,
    allowHTTP1: true,
  }, async(req, res) => {
    const code = await serve(opts, state, req, res);
    log(opts, req.method, String(code), req.url);
  }).listen(opts.port, 'localhost', () => {
    log(opts, 'Listening on', state.baseURL.toString());
    if (opts.open) {
      // Ignore promise
      open(new URL(opts.open, state.baseURL).toString());
    }
    if (opts.onListen) {
      opts.onListen.call(server, state.baseURL);
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
      }
    });
  });

  const notifySet = new DebounceSet((paths: string[]) => {
    const urls =
      paths.map(f => new URL(path.relative(root, f), state.baseURL).toString());
    notify(wss, urls);
  }, 100, opts.signal);

  state.watcher.on('change', f => {
    notifySet.add(f);
  });

  state.watcher.on('add', f => {
    notifySet.add(f);
  });

  state.watcher.on('unlink', f => {
    // Re-add to the watcher, so add will fire
    state.watcher.add(f);
  });

  opts.signal?.addEventListener('abort', () => {
    state.watcher.close();
    server.close();
  });

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
