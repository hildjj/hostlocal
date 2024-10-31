import assert from 'node:assert';
import {createCert} from '../lib/cert.js';
import fs from 'node:fs/promises';
import {normalizeOptions} from '../lib/opts.js';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import test from 'node:test';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-cert-'));

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
  });

  const kc = await createCert(opts);
  const {key, cert, notAfter} = kc;
  assert(key);
  assert(cert);
  assert(notAfter);

  const cached = await createCert(opts);
  assert.equal(key, cached.key);
  assert.equal(cert, cached.cert);
  assert.deepEqual(notAfter, cached.notAfter);

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
