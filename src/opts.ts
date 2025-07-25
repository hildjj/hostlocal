import {type CertOptions, DEFAULT_CERT_OPTIONS} from '@cto.af/ca';
import {OutgoingHttpHeaders} from 'node:http2';
import fs from 'node:fs/promises';
import {getLog} from '@cto.af/log';
import open from 'open';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export interface HostOptions extends CertOptions {

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
  host?: string;

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

export type RequiredHostOptions = Required<HostOptions>;

export const DEFAULT_HOST_OPTIONS: RequiredHostOptions = {
  ...DEFAULT_CERT_OPTIONS,
  config: '.hostlocal.js',
  dir: process.cwd(),
  exec: 'npm run build',
  CGI: Object.create(null),
  glob: [],
  headers: Object.create(null),
  host: 'localhost',
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
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ERR_MODULE_NOT_FOUND') {
        throw e;
      }
    }
  }

  const rest: RequiredHostOptions = {
    ...DEFAULT_HOST_OPTIONS,
    ...config,
    ...options,
  };

  // Backward-compatibility
  if (typeof rest.glob === 'string') {
    rest.glob = [rest.glob];
  }

  if (rest.prefix) {
    // Ensure rest.prefix starts with / and does not end with /
    // eslint-disable-next-line prefer-template
    rest.prefix = '/' + rest.prefix.trim().replace(/^[/.]+/, '');

    let last = rest.prefix.length;
    for (let i = last - 1; i >= 0; i--) {
      if (rest.prefix[i] !== '/') {
        break;
      }
      last = i;
    }
    rest.prefix = rest.prefix.slice(0, last);
  } else {
    rest.prefix = '';
  }

  if (root) {
    rest.dir = root;
  }
  rest.dir = await fs.realpath(rest.dir);

  rest.log = getLog({
    logFile: rest.logFile,
    logLevel: rest.logLevel,
  }, {
    host: rest.host,
    port: rest.port,
  });
  rest.log.debug(rest, 'Normalized options');
  return rest;
}
