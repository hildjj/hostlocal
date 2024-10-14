/* eslint-disable no-console */
import {type CertOptions, DEFAULT_CERT_OPTIONS, createCert} from './cert.js';
import {name as pkgName, version as pkgVersion} from './version.js';
import type {AddressInfo} from 'node:net';
import type {IncomingMessage} from 'node:http';
import fs from 'node:fs/promises';
import https from 'node:https';
import mt from 'mime-types';
import open from 'open';
import path from 'node:path';

export type ListenCallback = (url: string) => void;
export type EmptyCallback = () => void;

export interface HostOptions extends CertOptions {

  /** Config file name. */
  config?: string | null;

  /** List of files to try in order if a directory is specified as URL. */
  index?: string[];

  onListen?: ListenCallback | null;
  onClose?: EmptyCallback | null;

  /** Path to open. */
  open?: string;

  /** TCP Port to listen on. */
  port?: number;

  /** No logging if true. */
  quiet?: boolean;

  /** Abort this to stop the server. */
  signal?: AbortSignal | null;
}

export const DEFAULT_HOST_OPTIONS: Required<HostOptions> = {
  ...DEFAULT_CERT_OPTIONS,
  config: '.hostlocal.js',
  index: ['index.html', 'index.htm', 'README.md'],
  onClose: null,
  onListen: null,
  open: '/',
  port: 8111,
  quiet: false,
  signal: null,
};

function log(opts: Required<HostOptions>, req: IncomingMessage): void {
  if (!opts.quiet) {
    console.log(
      new Date()
        .toLocaleString('sv')
        .replace(' ', 'T'),
      req.url
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
  throw new Error('No index file found');
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
  let config = {};
  if (!Object.hasOwn(options, 'config') || options.config) {
    try {
      const fullConfig = path.resolve(
        process.cwd(),
        options.config || (DEFAULT_HOST_OPTIONS.config as string)
      );
      const c = await import(fullConfig);
      config = c.default;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ERR_MODULE_NOT_FOUND') {
        throw e;
      }
    }
  }
  const opts: Required<HostOptions> = {
    ...DEFAULT_HOST_OPTIONS,
    ...config,
    ...options,
  };

  const Server = `${pkgName}/${pkgVersion}`;

  const base = await fs.realpath(root);
  const cert = await createCert(opts);
  const server = https.createServer({
    ...cert,
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
    res.writeHead(200, {
      Server,
      'Content-Length': buf.length,
      'Content-Type': mt.lookup(file) || 'text/plain',
    });
    res.end(buf);
  }).listen(opts.port, 'localhost', () => {
    const {port} = server.address() as AddressInfo;
    const url = `https://localhost:${port}/`;
    if (!opts.quiet) {
      console.log(`Listening on ${url}`);
    }
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

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => server.close());
  }
}
