import * as os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import rs from 'jsrsasign';

const HOUR_ms = 60 * 60 * 1000;
const DAY_ms = 24 * HOUR_ms;

export interface CertOptions {

  /** Certificate invalid after this many days, server restart required. */
  notAfterDays?: number;

  /** Relative to cwd. */
  certDir?: string;
}

export const DEFAULT_CERT_OPTIONS: Required<CertOptions> = {
  notAfterDays: 7,
  certDir: '.cert',
};

export interface KeyCert {
  key: string;
  cert: string;
  notAfter: Date;
}

/**
 * Create a self-signed localhost certificate.
 *
 * @param options Certificate options.
 * @returns Cert and private key.
 */
export async function createCert(
  options: CertOptions
): Promise<KeyCert> {
  const opts: Required<CertOptions> = {
    ...DEFAULT_CERT_OPTIONS,
    ...options,
  };

  const now = new Date(new Date().getTime() - 10000);
  now.setMilliseconds(0);
  const plusHour = new Date(now.getTime() + HOUR_ms);
  const nextWeek = new Date(now.getTime() + (opts.notAfterDays * DAY_ms));

  const keyPath = path.resolve(process.cwd(), opts.certDir, 'key.pem');
  const certPath = path.resolve(process.cwd(), opts.certDir, 'cert.pem');
  try {
    const key = await fs.readFile(keyPath, 'utf8');
    rs.KEYUTIL.getKey(key); // Check for correctness
    const cert = await fs.readFile(certPath, 'utf8');
    const x = new rs.X509();
    x.readCertPEM(cert);
    const notAfter = rs.zulutodate(x.getNotAfter());
    if (notAfter > plusHour) {
      return {key, cert, notAfter};
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw e;
    }
  }

  const kp = rs.KEYUTIL.generateKeypair('EC', 'secp256r1');
  const prv = kp.prvKeyObj;
  const pub = kp.pubKeyObj;

  const {username} = os.userInfo();

  const x = new rs.KJUR.asn1.x509.Certificate({
    version: 3,
    serial: {int: 4},
    issuer: {str: '/CN=UserCA'},
    notbefore: rs.datetozulu(now, true, false),
    notafter: rs.datetozulu(nextWeek, true, false),
    subject: {str: `/CN=${username}`},
    sbjpubkey: pub,
    ext: [
      {extname: 'basicConstraints', cA: false},
      {extname: 'keyUsage', critical: true, names: ['digitalSignature']},
    ],
    sigalg: 'SHA256withECDSA',
    cakey: prv,
  });

  const key = rs.KEYUTIL.getPEM(prv, 'PKCS8PRV');
  const cert = x.getPEM();
  await fs.mkdir(opts.certDir, {recursive: true});
  await fs.writeFile(keyPath, key, 'utf8');
  await fs.writeFile(certPath, cert, 'utf8');
  return {key, cert, notAfter: nextWeek};
}
