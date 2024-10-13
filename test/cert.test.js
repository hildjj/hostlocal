import assert from 'node:assert';
import {createCert} from '../lib/cert.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-'));

test.after(async() => {
  await fs.rm(tmp, {recursive: true, force: true});
});

test('createCert', async() => {
  assert(tmp);

  const opts = {
    certDir: tmp,
  };
  const {key, cert, notAfter} = await createCert(opts);
  assert(key);
  assert(cert);
  assert(notAfter);

  const cached = await createCert(opts);
  assert.equal(key, cached.key);
  assert.equal(cert, cached.cert);
  assert.deepEqual(notAfter, cached.notAfter);

  await fs.writeFile(path.join(tmp, 'cert.pem'), 'MANGLED CERT', 'utf8');
  await assert.rejects(() => createCert(opts));
  await fs.writeFile(path.join(tmp, 'key.pem'), 'MANGLED KEY', 'utf8');
  await assert.rejects(() => createCert(opts));
});
