import type {AddressInfo, Socket} from 'node:net';
import {type ServerState, staticFile} from './staticFile.js';
import {name as pkgName, version as pkgVersion} from './version.js';
import type {Duplex} from 'node:stream';
import {EventEmitter} from 'node:events';
import type {KeyCert} from './cert.js';
import type {RequiredHostOptions} from './opts.js';
import type {TLSSocket} from 'node:tls';
import {WatchGlob} from './watchGlob.js';
import {WatchSet} from './watchSet.js';
import {WebSocketServer} from 'ws';
import http from 'node:http';
import http2 from 'node:http2';
import open from 'open';
import path from 'node:path';

export interface ServerEvents {
  close: [];
  listen: [url: URL];
  wsmessage: [json: any];
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
      this.#opts.log.error(
        'Certificate about to be invalid (%s).  Shutting down.',
        cert.notAfter
      );
      this.#ac.abort();
    }, afterTime);
    this.#ac.signal.addEventListener('abort', () => {
      this.#opts.log.info('Shutting down');
      this.#opts.log.flush();
      clearTimeout(this.#certTimout);
    });

    // Files we're going to watch before executing build step.
    // Usually inputs to be built into the files we serve.
    if (this.#opts.glob?.length) {
      this.#wg = new WatchGlob({
        ...this.#opts,
        signal: this.#ac.signal,
      });
      this.#wg.on('error', er => this.#opts.log.error(er));
    }

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

    this.#state = {
      headers: {
        'Server': `${pkgName}/${pkgVersion}`,
        'cache-control': `max-age=${Math.floor(afterTime / 1000)}`,
        ...this.#opts.headers,
      },
      base: this.#opts.dir,
      baseURL: this.#base(),
      watcher,
    };
  }

  public async start(): Promise<void> {
    // This will run the exec script once before we start serving if initial
    // is set.
    await this.#wg?.start();

    this.#server = http2.createSecureServer({
      key: this.#cert.key,
      cert: this.#cert.cert,
      allowHTTP1: true, // Needed to make ws work
    }, async(req, res) => {
      const code = await staticFile(this.#opts, this.#state, req, res);
      this.#opts.log.info('%s %d %s', req.method, code, req.url);
    });

    // HTTP2 doesn't have closeAllConnections
    this.#server.on('connection', (s: Socket) => {
      this.#opts.log.trace('Add sock %s:%d', s.remoteAddress, s.remotePort);
      this.#socks.add(s);
      s.once('close', () => {
        this.#opts.log.trace('Remove sock %s:%d', s.remoteAddress, s.remotePort);
        this.#socks.delete(s);
      });
    });
    this.#server.on('error', er => {
      this.#opts.log.fatal(er.message);
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
          this.#opts.log.info('Redirecting HTTP to HTTPS');
        }
      }
    });

    this.#ac.signal.addEventListener('abort', () => {
      for (const s of this.#socks) {
        s.destroy(); // Fires close event above, which cleans up.
      }
    });

    this.#server.listen({
      port: this.#opts.port,
      host: this.#opts.host,
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
        ws.on('error', (er: Error) => this.#opts.log.error(er));
        ws.on('message', msg => {
          const jmsg = JSON.parse(msg.toString());
          this.emit('wsmessage', jmsg);
          switch (jmsg?.type) {
            case 'shutdown':
              // Completely insecure when shutTimes < Infinity.
              // Only set shutTimes when testing.
              this.#opts.log.debug('Shutdown request %d', this.#opts.shutTimes);
              ws.close();
              if (--this.#opts.shutTimes <= 0) {
                this.close();
              }
              break;
          }
        });
      });
      this.#wss.on('error', er => {
        this.#opts.log.fatal(er.message);
      });
      this.#opts.log.info('Listening on: %s', base);
      if (this.#opts.open) {
        const u = new URL(this.#opts.open, base).toString();
        // Ignore promise
        open(u).catch((er: unknown) => this.#opts.log.error(er));
      }
      this.emit('listen', base);
    });

    this.#server.on('close', () => this.emit('close'));
  }

  public close(): void {
    this.#ac.abort();
  }

  #base(): URL {
    const urlHost = this.#opts.host.includes(':') ?
      `[${this.#opts.host}]` :
      this.#opts.host;
    const {port, prefix} = this.#opts;
    return new URL(`https://${urlHost}:${port}${prefix}/`);
  }

  #notify(urls: string[]): void {
    if (!this.#wss) {
      return;
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
