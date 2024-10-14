/* eslint-disable no-console */
import {type CertOptions, DEFAULT_CERT_OPTIONS, createCert} from './cert.js';
import {name as pkgName, version as pkgVersion} from './version.js';
import type {AddressInfo} from 'node:net';
import {Buffer} from 'node:buffer';
import {WatchGlob} from './watchGlob.js';
import {WebSocketServer} from 'ws';
import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import http2 from 'node:http2';
import markdownit from 'markdown-it';
import mt from 'mime-types';
import open from 'open';
import path from 'node:path';

export type ListenCallback = (url: string) => void;
export type EmptyCallback = () => void;

export interface HostOptions extends CertOptions {

  /** Config file name. */
  config?: string | null;

  /** Command to execute when watch glob matches. */
  exec?: string;

  /** Watch this glob.  When it changes, execute the exec command. */
  glob?: string | null;

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

  /** If true, do not process markdown to HTML. */
  rawMarkdown?: boolean;

  /** Abort this to stop the server. */
  signal?: AbortSignal | null;
}

export const DEFAULT_HOST_OPTIONS: Required<HostOptions> = {
  ...DEFAULT_CERT_OPTIONS,
  config: '.hostlocal.js',
  exec: 'npm run build',
  glob: null,
  index: ['index.html', 'index.htm', 'README.md'],
  onClose: null,
  onListen: null,
  open: '/',
  port: 8111,
  quiet: false,
  rawMarkdown: false,
  signal: null,
};

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

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
});

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

const clientScript = Buffer.concat([
  Buffer.from('\n<script type="module">\n'),
  await fs.readFile(new URL('./client.js', import.meta.url)),
  Buffer.from('\n</script>\n'),
]);

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
  const watcher = chokidar.watch([], {
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
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
        buf = Buffer.concat([buf, clientScript]);
        break;
      case 'text/markdown': {
        if (opts.rawMarkdown) {
          break;
        }
        const mkd = buf.toString();
        const html = `\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${req.url}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.7.0/github-markdown-dark.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

  <style>
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }

    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
  </style>
</head>
<body class="markdown-body">
${md.render(mkd)}
</body>
</html>
<script>hljs.highlightAll();</script>
`;
        buf = Buffer.concat([Buffer.from(html), clientScript]);
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

  // @ts-expect-error See https://github.com/websockets/ws/issues/1458
  const wss = new WebSocketServer({server});
  wss.on('connection', ws => {
    ws.on('error', (er: Error) => log(opts, er.message));
  });

  watcher.on('change', f => {
    // TODO: if we're getting a bunch of flashes, debounce these and send
    // a [...Set<string>].
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          update: `/${path.relative(root, f)}`,
        }));
      }
    }
  });

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => {
      watcher.close();
      server.close();
    });
  }

  if (opts.glob) {
    const wg = new WatchGlob({
      glob: opts.glob,
      shellCommand: opts.exec,
      signal: opts.signal,
    });
    await wg.start();
  }
}
