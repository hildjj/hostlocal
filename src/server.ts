import type {AddressInfo, Socket} from 'node:net';
import {type ServerState, staticFile} from './staticFile.js';
import {name as pkgName, version as pkgVersion} from './version.js';
import type {Duplex} from 'node:stream';
import {EventEmitter} from 'node:events';
import type {KeyCert} from '@cto.af/ca';
import type {RequiredHostOptions} from './opts.js';
import type {TLSSocket} from 'node:tls';
import {WatchGlob} from './watchGlob.js';
import {WatchSet} from './watchSet.js';
import {WebSocketServer} from 'ws';
import {errorHTML} from './errorHtml.js';
import fs from 'node:fs/promises';
import http from 'node:http';
import http2 from 'node:http2';
import path from 'node:path';
import {promiseWithResolvers} from '@cto.af/utils';

export type {
  RequiredHostOptions,
};

export interface ServerEvents {
  close: [];
  listen: [url: URL];
  wsmessage: [json: any];
  error: [error: Error];
  exec: [error?: Error];
}

export class HostLocalServer extends EventEmitter<ServerEvents> {
  #ac = new AbortController();
  #cert: KeyCert;
  #certTimout: NodeJS.Timeout;
  #opts: RequiredHostOptions;
  #wg: WatchGlob | undefined;
  #server: http2.Http2SecureServer | undefined = undefined;
  #socks = new Set<Duplex>();
  #state: ServerState;
  #wss: WebSocketServer | undefined = undefined;

  public constructor(cert: KeyCert, opts: RequiredHostOptions) {
    super();
    this.#cert = cert;
    this.#opts = opts;

    // Chain incoming signal onto our internal one.
    this.#opts.signal?.addEventListener('abort', () => this.#ac.abort());

    // One minute before certificate goes invalid, shut down.
    const afterTime = cert.notAfter.getTime() - new Date().getTime() - 60000;
    this.#certTimout = setTimeout(() => {
      this.#opts.log?.error(
        'Certificate about to be invalid (%s).  Shutting down.',
        cert.notAfter.toISOString()
      );
      this.#ac.abort();
    }, afterTime);
    this.#ac.signal.addEventListener('abort', () => {
      this.#opts.log?.info('Shutting down');
      this.#opts.log?.flush();
      clearTimeout(this.#certTimout);
    });

    // Watch for files we've served.
    const watcher = new WatchSet({
      wait: 100,
      signal: this.#ac.signal,
    });
    watcher.on('change', (paths: string[]) => {
      const urls =
        paths.map(f => new URL(
          path.relative(opts.dir, f),
          this.#state.baseURL
        ).toString());
      this.#notify(urls);
    });

    // Files we're going to watch before executing build step.
    // Usually inputs to be built into the files we serve.
    if (this.#opts.glob?.length) {
      this.#wg = new WatchGlob({
        ...this.#opts,
        signal: this.#ac.signal,
      });
      this.#wg.on('before', (cmd: string) => {
        this.#state.execError = '';
        this.#opts.log?.info('Executing "%s"', cmd);
      });
      this.#wg.on('exec', () => {
        this.emit('exec');
      });
      this.#wg.on('error', (e: unknown) => {
        const er = e as Error;
        this.emit('exec', er);
        this.#state.execError = er.message;
        watcher.changeAll();
      });
    }

    this.#state = {
      headers: {
        'Server': `${pkgName}/${pkgVersion}`,
        'cache-control': `max-age=${Math.floor(afterTime / 1000)}`,
        ...this.#opts.headers,
      },
      base: this.#opts.dir,
      baseURL: this.#base(),
      watcher,
      execError: undefined,
    };
  }

  public get baseURL(): string {
    // Do not return URL so that it can't be modified by receiver.
    return this.#state.baseURL.toString();
  }

  public get caCert(): string | undefined {
    return this.#cert?.ca?.cert;
  }

  public async start(): Promise<URL> {
    // This will run the exec script once before we start serving if initial
    // is set.
    await this.#wg?.start();

    // Switch to withResolvers when node 22 is required.
    const {promise, resolve, reject} = promiseWithResolvers<URL>();
    this.once('error', reject);
    this.once('listen', () => {
      this.off('error', reject);
    });

    this.#server = http2.createSecureServer({
      key: this.#cert.key,
      cert: this.#cert.chain,
      allowHTTP1: true, // Needed to make ws work
    }, async (req, res) => {
      if (this.#state.execError) {
        const code = errorHTML(this.#opts, this.#state, req, res);
        this.#opts.log?.info('%s %d %s', req.method, code, req.url);
      } else {
        const code = await staticFile(this.#opts, this.#state, req, res);
        this.#opts.log?.info('%s %d %s', req.method, code, req.url);
      }
    });

    // HTTP2 doesn't have closeAllConnections
    this.#server.on('connection', (s: Socket) => {
      const {remoteAddress = 'unknown', remotePort = -1} = s;

      this.#opts.log?.trace('Add sock %s:%d', remoteAddress, remotePort);
      this.#socks.add(s);
      s.once('close', () => {
        this.#opts.log?.trace('Remove sock %s:%d', remoteAddress, remotePort);
        this.#socks.delete(s);
      });
    });
    this.#server.on('error', er => {
      this.emit('error', er);
      this.#opts.log?.fatal(er.message);
      this.close();
    });

    this.#server.on('tlsClientError', (er, sock) => {
      // Hack to redirect http -> https
      const err = er as NodeJS.ErrnoException;
      if (err.code === 'ERR_SSL_HTTP_REQUEST') {
        const tlsSocket = sock as TLSSocket;
        // @ts-expect-error Internals
        const p: Socket = tlsSocket._parent;
        if (p) {
          const res = new http.ServerResponse(
            new http.IncomingMessage(p)
          );
          res.assignSocket(p);
          const code = http2.constants.HTTP_STATUS_MOVED_PERMANENTLY;
          res.writeHead(code, http.STATUS_CODES[code], {
            'Server': `${pkgName}/${pkgVersion}`,
            'Location': this.#base().toString(),
            'Content-Length': 0,
          });
          res.end();
          this.#opts.log?.info('Redirecting HTTP to HTTPS');
        }
      }
    });

    this.#ac.signal.addEventListener('abort', () => {
      for (const s of this.#socks) {
        s.destroy(); // Fires close event above, which cleans up.
      }
    });

    const host = Array.isArray(this.#opts.host) ?
      this.#opts.host[0] :
      this.#opts.host;

    this.#server.listen({
      port: this.#opts.port,
      host,
      ipv6Only: this.#opts.ipv6,
      signal: this.#ac.signal,
    }, () => {
      // If port was 0, we now need to recalc baseURL
      const {port = this.#opts.port} = this.#server?.address() as AddressInfo;
      this.#opts.port = port;
      const base = this.#base();
      this.#state.baseURL = base;

      // @ts-expect-error See https://github.com/websockets/ws/issues/1458
      this.#wss = new WebSocketServer({server: this.#server});

      this.#wss.on('connection', ws => {
        ws.on('error', (er: Error) => {
          this.emit('error', er); // Coverage needed
          this.#opts.log?.error(er); // Coverage needed
        });
        ws.on('message', msg => {
          const jmsg = JSON.parse(msg.toString());
          this.emit('wsmessage', jmsg);
          switch (jmsg?.type) {
            case 'shutdown':
              // Completely insecure when shutTimes < Infinity.
              // Only set shutTimes when testing.
              this.#opts.log?.debug('Shutdown request %d', this.#opts.shutTimes);
              ws.close();
              if (--this.#opts.shutTimes <= 0) {
                this.close();
              }
              break;
          }
        });
      });
      this.#wss.on('error', er => {
        this.emit('error', er); // Coverage needed
        this.#opts.log?.fatal(er.message); // Coverage needed
      });
      this.#opts.log?.info('Listening on: %s', base.toString());
      if (this.#opts.open && (typeof this.#opts.open === 'string')) {
        const u = new URL(this.#opts.open, base).toString();
        // Ignore promise
        this.#opts.openFn(u).catch((er: unknown) => this.#opts.log?.error(er));
      }
      // Copy, so it's not modifiable.
      const b = new URL(base);
      resolve(b);
      this.emit('listen', b);
    });

    let tempCA: string | null = null;
    if (this.caCert && this.#opts.temp && process.env.HOSTLOCAL_TEMP_CA_FILE) {
      tempCA = process.env.HOSTLOCAL_TEMP_CA_FILE;
      this.#opts.log?.debug('Writing temp CA file: "%s"', tempCA);
      await fs.writeFile(tempCA, this.caCert);
    }
    this.#server.on('close', () => {
      this.#rmCAfile().finally(() => {
        this.emit('close');
      });
    });
    return promise;
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.once('close', resolve);
      this.once('error', reject);
      this.#ac.abort();
    });
  }

  #base(): URL {
    const {host: ha, port} = this.#opts;
    const host = Array.isArray(ha) ? ha[0] : ha;
    const urlHost = host.includes(':') ? `[${host}]` : host;
    let {prefix} = this.#opts;
    if (!prefix.endsWith('/')) {
      prefix += '/';
    }
    return new URL(prefix, `https://${urlHost}:${port}/`);
  }

  async #rmCAfile(): Promise<void> {
    const tempCA = process.env.HOSTLOCAL_TEMP_CA_FILE;
    if (tempCA && this.#opts.temp) {
      this.#opts.log?.debug('Deleting temp CA file: "%s"', tempCA);
      await fs
        .rm(tempCA)
        .catch((e: unknown) => {
          this.#opts.log?.error(String(e));
        });
    }
  }

  #notify(urls: string[]): void {
    if (!this.#wss) {
      return; // Coverage needed
    }

    const msg = JSON.stringify({
      type: 'change',
      urls,
    });

    for (const ws of this.#wss.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }
}
