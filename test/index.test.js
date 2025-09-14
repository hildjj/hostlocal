import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {hostLocal} from '../lib/index.js';
import os from 'node:os';
import path from 'node:path';
import {promiseWithResolvers} from '@cto.af/utils';
import test from 'node:test';
import tls from 'node:tls';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-index-'));
const root = fileURLToPath(new URL('../', import.meta.url));
const certs = [];

test.before(t => {
  const origCsC = tls.createSecureContext;
  t.mock.method(tls, 'createSecureContext', options => {
    const res = origCsC(options);
    for (const c of certs) {
      res.context.addCACert(c);
    }
    return res;
  });
});

test.after(async t => {
  t.mock.reset();
  await fs.rm(tmp, {recursive: true, force: true});
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
});

test('hostLocal', async t => {
  const ac = new AbortController();

  const openFn = t.mock.fn(() => Promise.reject(new Error('Testing open')));
  const server = await hostLocal(root, {
    caDir: tmp,
    certDir: tmp,
    config: null,
    openFn,
    port: 9111,
    logLevel: 3,
    signal: ac.signal,
    prefix: 'foo',
    temp: true,
    // Shut the server down when the cert expires.
    notAfterDays: 62 / (24 * 60 * 60), // 60s before is when stop happens.
  });
  const p = promiseWithResolvers();
  server.on('close', p.resolve);

  const url = await server.start();
  certs.push(server.caCert);
  assert.equal(url.toString(), server.baseURL);
  assert(url.toString().endsWith('/'));
  const readme = await (await fetch(url)).text();
  assert.match(readme, /^<!DOCTYPE html>/);

  const resp = await fetch(new URL('__DOES_NOT_EXIST__.html', url));
  assert.equal(resp.status, 404);

  const hurl = new URL(url);
  hurl.protocol = 'http:';
  const red = await fetch(hurl, {redirect: 'manual'});
  assert.equal(red.status, 301);

  assert.equal(openFn.mock.callCount(), 1);

  // Same port, should fail startup.
  await assert.rejects(async () => {
    const failServer = await hostLocal(root, {
      caDir: path.join(tmp, 'fail'),
      certDir: path.join(tmp, 'fail'),
      config: null,
      open: null,
      port: 9111,
      logLevel: 3,
      temp: true,
    });
    await failServer.start();
  });

  // Wait for cert to time out.
  return p.promise;
});

test('glob exec', async () => {
  const ac = new AbortController();

  const d = new Date().toISOString();
  const foo = path.join(tmp, 'foo');
  await fs.writeFile(foo, `foo ${d} foo`);

  const server = await hostLocal(tmp, {
    caDir: tmp,
    certDir: tmp,
    config: null,
    open: false,
    port: 9112,
    logLevel: 3,
    signal: ac.signal,
    glob: [foo],
    exec: `grep foo ${foo}`,
    initial: true,
    temp: true,
  });

  let fu = '';
  server.on('exec', async e => {
    if (e) {
      const res = await fetch(fu);
      const txt = await res.text();

      assert.match(txt, /with code 1 with output/);
      server.close();
    } else {
      setTimeout(() => fs.writeFile(foo, `bar ${d} bar`), 100);
    }
  });
  const p = promiseWithResolvers();
  server.on('close', p.resolve);
  const url = await server.start();
  certs.push(server.caCert);

  fu = new URL('foo', url);
  const res = await fetch(fu);
  assert.equal(`foo ${d} foo`, await res.text());

  await fs.writeFile(foo, `foo ${d}`);

  await p.promise;
});

test('IPv6 URL', async () => {
  const server = await hostLocal(root, {
    host: '::1',
    caDir: tmp,
    certDir: tmp,
    config: null,
    open: false,
    port: 9113,
    logLevel: 3,
    temp: true,
  });
  const url = await server.start();
  assert.equal(url.toString(), 'https://[::1]:9113/');
  certs.push(server.caCert);
  const res = await fetch('https://[::1]:9113/');
  const txt = await res.text();
  assert(txt);
  await server.close();
});
