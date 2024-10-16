import {type CertOptions, DEFAULT_CERT_OPTIONS} from './cert.js';
import path from 'node:path';

export type ListenCallback = (url: URL) => void;
export type EmptyCallback = () => void;

export interface HostOptions extends CertOptions {

  /** Config file name. */
  config?: string | null;

  /** Command to execute when watch glob matches. */
  exec?: string;

  /** Watch this glob.  When it changes, execute the exec command. */
  glob?: string[] | null;

  /** List of files to try in order if a directory is specified as URL. */
  index?: string[];

  /**
   * Fired when server is listening.  Only useful for testing.
   */
  onListen?: ListenCallback | null;

  /**
   * Fired when the server has shut down.  Only useful for testing.
   */
  onClose?: EmptyCallback | null;

  /** Path to open. */
  open?: string;

  /** TCP Port to listen on. */
  port?: number;

  /** No logging if true. */
  quiet?: boolean;

  /** If true, do not process markdown to HTML. */
  rawMarkdown?: boolean;

  /** Shut down the server when we are asked this many times. */
  shutTimes?: number;

  /** Abort this to stop the server. */
  signal?: AbortSignal | null;
}

export type RequiredHostOptions = Required<HostOptions>;

export const DEFAULT_HOST_OPTIONS: RequiredHostOptions = {
  ...DEFAULT_CERT_OPTIONS,
  config: '.hostlocal.js',
  exec: 'npm run build',
  glob: [],
  index: ['index.html', 'index.htm', 'README.md'],
  onClose: null,
  onListen: null,
  open: '/',
  port: 8111,
  quiet: false,
  rawMarkdown: false,
  shutTimes: Infinity,
  signal: null,
};

/**
 * Turns sloppy possibly-undefined options into rigidly-defined options
 * with all fields required, collapsing types as necessary.
 *
 * @param options Options passed in from CLI, for instance.
 * @returns Normalized options.
 */
export async function normalizeOptions(
  options: HostOptions
): Promise<RequiredHostOptions> {
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

  const rest: RequiredHostOptions = {
    ...DEFAULT_HOST_OPTIONS,
    ...config,
    ...options,
  };

  // Backward-compatibility
  if (typeof rest.glob === 'string') {
    rest.glob = [rest.glob];
  }
  return rest;
}
