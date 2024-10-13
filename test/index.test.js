import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import {hostLocal} from '../lib/index.js';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

test.after(() => {
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

  await hostLocal(root, {
    signal: ac.signal,
    quiet: true,
    open: null,
    port: 9111,
    onListen: async url => {
      try {
        const readme = await (await fetch(url)).text();
        assert.match(readme, /^# hostlocal/);

        const resp = await fetch(new URL('__DOES_NOT_EXIST__.html', url));
        assert.equal(resp.status, 404);
      } catch (e) {
        reject(e);
      } finally {
        ac.abort('Finished');
      }
    },
    onClose: () => {
      resolve();
    },
  });
  await promise;
});
