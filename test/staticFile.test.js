import {__debugError, staticFile} from '../lib/staticFile.js';
import {name, version} from '../lib/version.js';
import assert from 'node:assert';
import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import httpMocks from 'node-mocks-http';
import {normalizeOptions} from '../lib/opts.js';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import test from 'node:test';

test('staticFile', async() => {
  const opts = await normalizeOptions({
    config: 'DOES_NOT_EXIST',
    rawMarkdown: true,
    index: ['__DOES_NOT_EXIST__', 'src', 'index.html', 'index.htm', 'README.md'],
    logLevel: 10,
    filter: {
      'text/yaml': ['wc -l', 'text/plain'],
      // Expect error with stderr
      'application/javascript': ["printf '%<'", 'text/html'],
      // This is unstable for a few reasons
      'application/node': ['kill $$', 'text/plain'],
      // Invalid filter
      'application/xml': 'invalid',
      'text/tab-separated-values': ['___NOT_VALID_SCRIPT_IS_FAIL', 'text/plain'],
    },
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

  code = await staticFile(opts, state, ...reqRes('/pnpm-lock.yaml'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/eslint.config.js'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/typedoc.config.cjs'));
  assert.equal(code, 200);

  code = await staticFile(opts, state, ...reqRes('/test/fixtures/test.xml'));
  assert.equal(code, 500);

  code = await staticFile(opts, state, ...reqRes('/test/fixtures/test.tsv'));
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

  code = await staticFile(opts, state, ...reqRes('/favicon.ico', {
    headers: {
      'if-none-match': etag,
    },
  }));
  assert.equal(code, 304);

  code = await staticFile(opts, state, ...reqRes('/', {
    method: 'OPTIONS',
  }));
  assert.equal(code, 204);

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
