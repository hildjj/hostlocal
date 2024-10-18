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

  function reqRes(url, rOpts = {method: 'GET'}) {
    const req = httpMocks.createRequest({...rOpts, url});
    const res = httpMocks.createResponse({req});
    return [req, res];
  }

  let code = await serve(opts, state, ...reqRes('////'));
  assert.equal(code, 500);

  code = await serve(opts, state, ...reqRes('/', {method: 'POST'}));
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

  const [req, res] = reqRes('/favicon.ico');
  code = await serve(opts, state, req, res);
  assert.equal(code, 200);
  const etag = res.getHeader('etag');

  const [reqE, resE] = reqRes('/favicon.ico', {
    headers: {
      'if-none-match': etag,
    },
  });
  code = await serve(opts, state, reqE, resE);
  assert.equal(code, 304);
});

