import {name, version} from '../lib/version.js';
import assert from 'node:assert';
import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import httpMocks from 'node-mocks-http';
import {normalizeOptions} from '../lib/opts.js';
import {staticFile} from '../lib/staticFile.js';
import test from 'node:test';

test('staticFile', async() => {
  const opts = await normalizeOptions({
    config: 'DOES_NOT_EXIST',
    rawMarkdown: true,
    index: ['__DOES_NOT_EXIST__', 'src', 'index.html', 'index.htm', 'README.md'],
    logLevel: 10,
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

  let code = await staticFile(opts, state, ...reqRes('////'));
  assert.equal(code, 500);

  code = await staticFile(opts, state, ...reqRes('/', {method: 'POST'}));
  assert.equal(code, 405);

  code = await staticFile(opts, state, ...reqRes('/'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/package.json'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/test/fixtures/foo.unknown-type'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/docs'));
  assert.equal(code, 301);

  state.baseURL.pathname += '/foo';
  code = await staticFile(opts, state, ...reqRes('/unknown'));
  assert.equal(code, 403);

  const [req, res] = reqRes('/favicon.ico');
  code = await staticFile(opts, state, req, res);
  assert.equal(code, 200);
  const etag = res.getHeader('etag');

  const [reqE, resE] = reqRes('/favicon.ico', {
    headers: {
      'if-none-match': etag,
    },
  });
  code = await staticFile(opts, state, reqE, resE);
  assert.equal(code, 304);

  const [reqO, resO] = reqRes('/', {
    method: 'OPTIONS',
  });
  code = await staticFile(opts, state, reqO, resO);
  assert.equal(code, 204);

  const [reqH, resH] = reqRes('/favicon.ico', {
    method: 'HEAD',
  });
  code = await staticFile(opts, state, reqH, resH);
  assert.equal(code, 200);

  const statM = await fs.stat(
    new URL('../assets/favicon.ico', import.meta.url)
  );
  const ims = new Date(statM.mtime);
  ims.setMilliseconds(0);

  const [reqM, resM] = reqRes('/favicon.ico', {
    headers: {
      'if-modified-since': ims.toUTCString(),
    },
  });
  code = await staticFile(opts, state, reqM, resM);
  assert.equal(code, 304);
});

