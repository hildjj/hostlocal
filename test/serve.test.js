import {name, version} from '../lib/version.js';
import assert from 'node:assert';
import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import httpMocks from 'node-mocks-http';
import {normalizeOptions} from '../lib/opts.js';
import {serve} from '../lib/serve.js';
import test from 'node:test';

test('serve', async() => {
  const opts = await normalizeOptions({
    config: 'DOES_NOT_EXIST',
    rawMarkdown: true,
  });
  const state = {
    headers: {
      Server: `${name}/${version}`,
    },
    base: await fs.realpath(new URL('../', import.meta.url)),
    baseURL: new URL(`https://localhost:${opts.port}/`),
    watcher: chokidar.watch([], {
      atomic: true,
      ignoreInitial: true,
      persistent: false,
    }),
  };

  function reqRes(url, method = 'GET') {
    const req = httpMocks.createRequest({method, url});
    const res = httpMocks.createResponse({req});
    return [req, res];
  }

  let code = await serve(opts, state, ...reqRes('////'));
  assert.equal(code, 500);

  code = await serve(opts, state, ...reqRes('/', 'POST'));
  assert.equal(code, 405);

  code = await serve(opts, state, ...reqRes('/'));
  assert.equal(code, 200);

  code = await serve(opts, state, ...reqRes('/package.json'));
  assert.equal(code, 200);

  code = await serve(opts, state, ...reqRes('/test/fixtures/foo.unknown-type'));
  assert.equal(code, 200);

  state.baseURL.pathname += '/foo';
  code = await serve(opts, state, ...reqRes('/unknown'));
  assert.equal(code, 403);

  code = await serve(opts, state, ...reqRes('/favicon.ico'));
  assert.equal(code, 200);
});

