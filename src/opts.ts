import {type CertOptions, DEFAULT_CERT_OPTIONS} from '@cto.af/ca';
import {OutgoingHttpHeaders} from 'node:http2';
import {childLogger} from '@cto.af/log';
import {errCode} from '@cto.af/utils';
import fs from 'node:fs/promises';
import open from 'open';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export interface HostOnlyOptions {
  /** Config file name. */
  config?: string | null;

  /** Directory to serve. */
  dir?: string;

  /** Command to execute when watch glob matches. */
  exec?: string;

  /** Pass files of these MIME types to a CGI handler on the command line. */
  CGI?: {
    [contentType: string]: string;
  };

  /** Watch this glob.  When it changes, execute the exec command. */
  glob?: string[] | null;

  /**
   * Extra headers to add to every response.
   */
  headers?: OutgoingHttpHeaders;

  /** Hostname or IP address to listen on. "::" for everything. */
  host?: string | string[];

  /** List of files to try in order if a directory is specified as URL. */
  index?: string[];

  /**
   * If glob is specified, run the exec command on startup as well as on
   * file change.
   */
  initial?: boolean;

  /** Listen on IPv6 only, if host supports both IPv4 and IPv6. */
  ipv6?: boolean;

  /** Path to open. */
  open?: string | boolean;

  /** For testing only. */
  openFn?: typeof open;

  /** TCP Port to listen on. */
  port?: number;

  /**
   * Make all of the URLs served have paths that start with this prefix,
   * followed by a slash.
   */
  prefix?: string;

  /** If true, do not process markdown to HTML. */
  rawMarkdown?: boolean;

  /** If true, append script to HTML to cause automatic refreshes. */
  script?: boolean;

  /** Shut down the server when we are asked this many times. */
  shutTimes?: number;

  /** Abort this to stop the server. */
  signal?: AbortSignal | null;

  /** Time, in ms, to let glob commands run before termination. */
  timeout?: number | null;
}

export type HostOptions = HostOnlyOptions & CertOptions;
export type RequiredHostOptions = Required<HostOnlyOptions> & CertOptions;

export const DEFAULT_HOST_OPTIONS: RequiredHostOptions = {
  ...DEFAULT_CERT_OPTIONS,
  config: '.hostlocal.js',
  dir: process.cwd(),
  exec: 'npm run build',
  CGI: Object.create(null),
  glob: [],
  headers: Object.create(null),
  host: ['localhost', '::1', '127.0.0.1'],
  index: ['index.html', 'index.htm', 'README.md'],
  initial: false,
  ipv6: false,
  open: '.',
  openFn: open,
  port: 8111,
  prefix: '',
  rawMarkdown: false,
  script: true,
  shutTimes: Infinity,
  signal: null,
  timeout: null,
};

/**
 * Turns sloppy possibly-undefined options into rigidly-defined options
 * with all fields required, collapsing types as necessary.
 *
 * @param options Options passed in from CLI, for instance.
 * @param root Root directory to override options.dir.
 * @returns Normalized options.
 */
export async function normalizeOptions(
  options: HostOptions = {},
  root?: string | null
): Promise<RequiredHostOptions> {
  let config: HostOptions = Object.create(null);
  if (!Object.prototype.hasOwnProperty.call(options, 'config') || options.config) {
    try {
      const fullConfig = pathToFileURL(path.resolve(
        process.cwd(),
        options.config || (DEFAULT_HOST_OPTIONS.config as string)
      )).toString();
      const c = await import(fullConfig);
      config = c.default;
    } catch (e) {
      if (!errCode(e, 'ERR_MODULE_NOT_FOUND')) {
        throw e;
      }
    }
  }

  const opts: RequiredHostOptions = {
    ...DEFAULT_HOST_OPTIONS,
    ...config,
    ...options,
  };

  // Backward-compatibility
  if (typeof opts.glob === 'string') {
    opts.glob = [opts.glob];
  }

  if (opts.prefix) {
    // Ensure rest.prefix starts with / and does not end with /
    // eslint-disable-next-line prefer-template
    opts.prefix = '/' + opts.prefix.trim().replace(/^[/.]+/, '');

    let last = opts.prefix.length;
    for (let i = last - 1; i >= 0; i--) {
      if (opts.prefix[i] !== '/') {
        break;
      }
      last = i;
    }
    opts.prefix = opts.prefix.slice(0, last);
  } else {
    opts.prefix = '';
  }

  if (root) {
    opts.dir = root;
  }
  opts.dir = await fs.realpath(opts.dir);

  opts.log = childLogger(opts, {
    host: opts.host,
    port: opts.port,
    ns: 'host',
  });
  opts.log.debug('Normalized options: %o', opts);
  return opts;
}
