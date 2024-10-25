import {DEFAULT_LOG_OPTIONS, LogOptions} from './log.js';
import {deleteSecret, getSecret, setSecret} from './keychain.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import rs from 'jsrsasign';

const HOUR_ms = 60 * 60 * 1000;
const DAY_ms = 24 * HOUR_ms;
const CA_FILE = '_CA';
const CA_SUBJECT = 'C=US/ST=Colorado/L=Denver/CN=HostLocal-Root-CA';
const KEYCHAIN_SERVICE = 'com.github.hildjj.HostLocal';

export interface CertOptions extends LogOptions {

  /**
   * Minimum number of days the serve can run.  Ensure the cert will good
   * at least this long.
   */
  minRunDays?: number;

  /** Certificate invalid after this many days, server restart required. */
  notAfterDays?: number;

  /** Relative to cwd. */
  certDir?: string;

  /** Hostname for cert.  Used for subject CN, DNS subjectAltName. */
  host?: string;
}

export type RequiredCertOptions = Required<CertOptions>;

export const DEFAULT_CERT_OPTIONS: RequiredCertOptions = {
  ...DEFAULT_LOG_OPTIONS,
  minRunDays: 1,
  notAfterDays: 7,
  certDir: '.cert',
  host: 'localhost',
};

interface KeyCertNames {
  certDir: string;
  keyName: string;
  certName: string;
}

function daysFromNow(days: number, now = new Date()): Date {
  return new Date(now.getTime() + (days * DAY_ms));
}

export type AnyKey = rs.RSAKey | rs.KJUR.crypto.DSA | rs.KJUR.crypto.ECDSA;

export class KeyCert {
  public readonly name: string;
  public readonly key: string;
  public readonly cert: string;
  public readonly notAfter: Date;
  public readonly ca: KeyCert | undefined;

  public constructor(
    name: string,
    key: AnyKey | string,
    cert: rs.KJUR.asn1.x509.Certificate | string,
    ca?: KeyCert
  ) {
    this.name = name;
    this.key = (typeof key === 'string') ?
      key :
      rs.KEYUTIL.getPEM(key, 'PKCS8PRV');
    this.cert = (typeof cert === 'string') ? cert : cert.getPEM();
    const x = new rs.X509();
    x.readCertPEM(this.cert);
    this.notAfter = rs.zulutodate(x.getNotAfter());
    this.ca = ca;
  }

  public static async read(
    opts: RequiredCertOptions,
    name: string
  ): Promise<KeyCert | null> {
    try {
      const names = this.#getNames(opts, name);
      const key = await getSecret(opts, KEYCHAIN_SERVICE, names.keyName);
      const cert = await fs.readFile(names.certName, 'utf8');
      const kc = new KeyCert(name, key, cert);
      // If the server can't run for at least a day, create new certs.
      if (kc.notAfter < daysFromNow(opts.minRunDays)) {
        return null;
      }
      return kc;
    } catch (e) {
      const er = e as NodeJS.ErrnoException;
      if (er.code === 'ENOENT') {
        return null;
      }
      throw e;
    }
  }

  static #getNames(opts: RequiredCertOptions, name: string): KeyCertNames {
    const certDir = path.resolve(process.cwd(), opts.certDir);
    const keyName = path.join(certDir, `${name}.key.pem`);
    const certName = path.join(certDir, `${name}.cert.pem`);
    return {
      certDir,
      keyName,
      certName,
    };
  }

  public async delete(opts: RequiredCertOptions): Promise<void> {
    const names = KeyCert.#getNames(opts, this.name);
    await deleteSecret(opts, KEYCHAIN_SERVICE, names.keyName);
    await fs.rm(names.certName);
  }

  public async write(opts: RequiredCertOptions): Promise<void> {
    const names = KeyCert.#getNames(opts, this.name);
    await fs.mkdir(names.certDir, {recursive: true});
    await setSecret(opts, KEYCHAIN_SERVICE, names.keyName, this.key);
    await fs.writeFile(names.certName, this.cert, 'utf8');
  }
}

/**
 * Read a valid CA cert, or create a new one, writing it.
 *
 * @param options Cert options.
 * @returns Private Key / Certificate for CA.
 */
export async function createCA(options: CertOptions): Promise<KeyCert> {
  const opts: RequiredCertOptions = {
    ...DEFAULT_CERT_OPTIONS,
    ...options,
  };

  const pair = await KeyCert.read(opts, CA_FILE);
  if (pair) {
    return pair; // Still valid.
  }

  opts.log.info('Creating new CA certificate');
  // Create a self-signed CA cert
  const kp = rs.KEYUTIL.generateKeypair('EC', 'secp256r1');
  const prv = kp.prvKeyObj;
  const pub = kp.pubKeyObj;

  const now = new Date();
  const recently = new Date(now.getTime() - 10000); // 10s ago.
  const oneYear = daysFromNow(365, now);

  const ca_cert = new rs.KJUR.asn1.x509.Certificate({
    version: 3,
    serial: {int: now.getTime()},
    issuer: {str: CA_SUBJECT},
    notbefore: rs.datetozulu(recently, false, false),
    notafter: rs.datetozulu(oneYear, false, false),
    subject: {str: CA_SUBJECT},
    sbjpubkey: pub,
    ext: [
      {extname: 'basicConstraints', cA: true},
    ],
    sigalg: 'SHA256withECDSA',
    cakey: prv,
  });
  const kc = new KeyCert(CA_FILE, prv, ca_cert);
  await kc.write(opts);

  if (process.platform === 'darwin') {
    opts.log.info(`
To trust the new CA, try:
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${path.resolve(opts.certDir, CA_FILE)}.cert.pem
`);
  }
  return kc;
}

/**
 * Create a CA-signed localhost certificate.
 *
 * @param options Certificate options.
 * @returns Cert and private key.
 */
export async function createCert(
  options: CertOptions
): Promise<KeyCert> {
  const opts: RequiredCertOptions = {
    ...DEFAULT_CERT_OPTIONS,
    ...options,
  };

  const pair = await KeyCert.read(opts, opts.host);
  if (pair) {
    return pair; // Still valid.
  }

  const ca = await createCA(opts);
  opts.log.info(`Creating cert for "${opts.host}".`);

  const now = new Date();
  const recently = new Date(now.getTime() - 10000); // 10s ago.
  const nextWeek = daysFromNow(opts.notAfterDays, now);

  const kp = rs.KEYUTIL.generateKeypair('EC', 'secp256r1');
  const prv = kp.prvKeyObj;
  const pub = kp.pubKeyObj;

  const x = new rs.KJUR.asn1.x509.Certificate({
    version: 3,
    serial: {int: now.getTime()},
    issuer: {str: CA_SUBJECT},
    notbefore: rs.datetozulu(recently, true, false),
    notafter: rs.datetozulu(nextWeek, true, false),
    subject: {str: `/CN=${opts.host}`},
    sbjpubkey: pub,
    ext: [
      {extname: 'basicConstraints', cA: false},
      {extname: 'keyUsage', critical: true, names: ['digitalSignature']},
      {extname: 'subjectAltName', array: [{dns: opts.host}]},
    ],
    sigalg: 'SHA256withECDSA',
    cakey: ca.key,
  });

  const kc = new KeyCert(opts.host, prv, x.getPEM(), ca);
  await kc.write(opts);
  return kc;
}
