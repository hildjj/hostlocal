import {__debugError, staticFile} from '../lib/staticFile.js';
import {name, version} from '../lib/version.js';
import assert from 'node:assert';
import chokidar from 'chokidar';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import httpMocks from 'node-mocks-http';
import {normalizeOptions} from '../lib/opts.js';
import test from 'node:test';
import {types} from 'mime-types';

types.crlf = 'application/x-hostlocal-crlf';
const CHUNKS = fileURLToPath(new URL('./fixtures/chunks.js', import.meta.url));

test('staticFile', async () => {
  const opts = await normalizeOptions({
    config: 'DOES_NOT_EXIST',
    rawMarkdown: true,
    index: ['__DOES_NOT_EXIST__', 'src', 'index.html', 'index.htm', 'README.md'],
    logLevel: 10,
    CGI: {
      'application/x-hostlocal-crlf': CHUNKS,
    },
    temp: true,
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

  code = await staticFile(opts, state, ...reqRes('/', {method: 'DELETE'}));
  assert.equal(code, 405);

  code = await staticFile(opts, state, ...reqRes('/'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/package.json'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/test/fixtures/foo.unknown-type'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/src/'));
  assert.equal(code, 404);

  code = await staticFile(opts, state, ...reqRes('/test/fixtures/cgi.crlf'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/test/fixtures/no-content-type.crlf'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/docs'));
  assert.equal(code, 301);

  code = await staticFile(opts, state, ...reqRes('/', {
    method: 'OPTIONS',
  }));
  assert.equal(code, 204);

  // ------ MOVE TO /foo as base -----
  state.baseURL.pathname += 'foo';
  code = await staticFile(opts, state, ...reqRes('/unknown'));
  assert.equal(code, 403);

  const [req, res] = reqRes('/favicon.ico');
  code = await staticFile(opts, state, req, res);
  assert.equal(code, 200);
  const etag = res.getHeader('etag');

  code = await staticFile(opts, state, ...reqRes('/favicon.ico', {
    headers: {
      'if-none-match': etag,
    },
  }));
  assert.equal(code, 304);

  code = await staticFile(opts, state, ...reqRes('/favicon.ico', {
    method: 'HEAD',
  }));
  assert.equal(code, 200);

  const statM = await fs.stat(
    new URL('../assets/favicon.ico', import.meta.url)
  );
  const ims = new Date(statM.mtime);
  ims.setMilliseconds(0);

  code = await staticFile(opts, state, ...reqRes('/favicon.ico', {
    headers: {
      'if-modified-since': ims.toUTCString(),
    },
  }));
  assert.equal(code, 304);
});

test('debugError', () => {
  const debugs = [];
  const log = {
    debug(...args) {
      debugs.push(args);
    },
  };
  __debugError(log, null);
  __debugError(log, new Error('Hi'));
  assert.deepEqual(debugs, [
    ['Hi'],
  ]);
});
