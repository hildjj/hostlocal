import type {HostOptions} from './opts.js';

/**
 * Export this as the default from your config file to get type information.
 *
 * @param opts Options.
 * @returns The opts passed in.
 */
export function defineConfig(opts: HostOptions): HostOptions {
  return opts;
}
