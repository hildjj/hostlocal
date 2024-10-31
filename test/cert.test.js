import assert from 'node:assert';
import {createCert} from '../lib/cert.js';
import fs from 'node:fs/promises';
import {normalizeOptions} from '../lib/opts.js';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import test from 'node:test';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-cert-'));
const ISSUER = '/CN=github.hildjj.hostlocal';
test.after(async() => {
  await fs.rm(tmp, {recursive: true, force: true});
});

test('createCert', async() => {
  assert(tmp);

  const opts = await normalizeOptions({
    certDir: tmp,
    notAfterDays: 3,
    logLevel: -10,
    logFile: path.join(tmp, 'cert.log'),
    caSubject: ISSUER,
  });

  const kc = await createCert(opts);
  const {key, cert, notAfter, ca, issuer, subject} = kc;
  assert(key);
  assert(cert);
  assert(notAfter);
  assert(ca);

  assert.equal(ca.subject, ISSUER);
  assert.equal(subject, '/CN=localhost');
  assert.equal(issuer, ISSUER);

  const cached = await createCert(opts);
  assert.equal(key, cached.key);
  assert.equal(cert, cached.cert);
  assert.deepEqual(notAfter, cached.notAfter);

  // Check what happens when the CA subject is wrong.
  const ISSUER2 = `${ISSUER}2`;
  // eslint-disable-next-line require-atomic-updates
  opts.caSubject = ISSUER2;
  const cert2 = await createCert(opts);
  assert.equal(cert2.ca.subject, ISSUER2);
  assert.equal(cert2.issuer, ISSUER2);

  await fs.writeFile(path.join(tmp, 'localhost.cert.pem'), 'MANGLED CERT', 'utf8');
  await assert.rejects(() => createCert(opts));

  // Doesn't exist, create new
  await fs.rm(path.join(tmp, 'localhost.cert.pem'));
  await assert.doesNotReject(() => createCert(opts));

  // Not long enough
  // eslint-disable-next-line require-atomic-updates
  opts.minRunDays = 7;
  await assert.doesNotReject(() => createCert(opts));

  await kc.delete(opts);
  await kc.ca?.delete(opts);
});
