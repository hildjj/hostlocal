import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {hostLocal} from '../lib/index.js';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import test from 'node:test';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-index-'));
const root = fileURLToPath(new URL('../', import.meta.url));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

test.after(async() => {
  await fs.rm(tmp, {recursive: true, force: true});
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
});

test('index', async() => {
  const ac = new AbortController();

  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const server = await hostLocal(root, {
    certDir: tmp,
    config: null,
    open: null,
    port: 9111,
    logLevel: -3,
    signal: ac.signal,
    // Shut the server down when the cert expires.
    notAfterDays: 62 / (24 * 60 * 60), // 60s before is when stop happens.
  });
  server.on('listen', async url => {
    try {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const readme = await (await fetch(url)).text();
      assert.match(readme, /^<!DOCTYPE html>/);

      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const resp = await fetch(new URL('__DOES_NOT_EXIST__.html', url));
      assert.equal(resp.status, 404);

      const hurl = new URL(url);
      hurl.protocol = 'http:';
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const red = await fetch(hurl, {redirect: 'manual'});
      assert.equal(red.status, 301);

      await new Promise((res, rej) => {
        try {
          // Same port, should fail startup.
          hostLocal(root, {
            certDir: tmp,
            config: null,
            open: null,
            port: 9111,
            logLevel: -3,
          })
            .then(server2 => {
              server2.on('error', res);
              server2.start();
            })
            .catch(rej);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });

  server.on('close', resolve);
  server.start();
  await promise;
});
