import {type CertOptions, DEFAULT_CERT_OPTIONS} from './cert.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setLogLevel} from './log.js';

export interface HostOptions extends CertOptions {

  /** Config file name. */
  config?: string | null;

  /** Directory to serve. */
  dir?: string;

  /** Command to execute when watch glob matches. */
  exec?: string;

  /** Watch this glob.  When it changes, execute the exec command. */
  glob?: string[] | null;

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
  open?: string;

  /** TCP Port to listen on. */
  port?: number;

  /**
   * Make all of the URLs served have paths that start with this prefix,
   * followed by a slash.
   */
  prefix?: string;

  /** If true, do not process markdown to HTML. */
  rawMarkdown?: boolean;

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
  glob: [],
  host: 'localhost',
  index: ['index.html', 'index.htm', 'README.md'],
  initial: false,
  ipv6: false,
  open: '.',
  port: 8111,
  prefix: '',
  rawMarkdown: false,
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
  options: HostOptions,
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
    rest.prefix = '/' + rest.prefix.trim().replaceAll(/^[/.]+|\/+$/g, '');
  } else {
    rest.prefix = '';
  }

  if (root) {
    rest.dir = root;
  }
  rest.dir = await fs.realpath(rest.dir);

  setLogLevel(rest, {
    host: rest.host,
    port: rest.port,
  });
  rest.log.debug(rest, 'Normalized options');
  return rest;
}
