import {type HostOptions, normalizeOptions} from './opts.js';
import {HostLocalServer} from './server.js';
import {createCert} from './cert.js';

export type {HostOptions} from './opts.js';
export type {KeyCert} from './cert.js';
export type {AnyKey, CertOptions} from './cert.js';

/**
 * Server a directory via HTTPS.
 *
 * @param root Root directory to serve from.
 * @param options Options.
 * @returns Server instance, which requires a call to start().
 */
export async function hostLocal(
  root: string | null,
  options: HostOptions
): Promise<HostLocalServer> {
  const opts = await normalizeOptions(options, root);
  const cert = await createCert(opts);

  return new HostLocalServer(cert, opts);
}
