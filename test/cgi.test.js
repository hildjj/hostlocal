import {Readable, Writable, pipeline} from 'node:stream';
import {Buffer} from 'node:buffer';
import {CGI} from '../lib/cgi.js';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import snap from 'snappy-snaps';
import test from 'node:test';

const CHUNKS = fileURLToPath(new URL('./fixtures/chunks.js', import.meta.url));
const CRLF_FILE = fileURLToPath(new URL('./fixtures/cgi.crlf', import.meta.url));
const LF_FILE = fileURLToPath(new URL('./fixtures/cgi.lf', import.meta.url));

class Source extends Readable {
  constructor(...str) {
    super();
    for (const b of str) {
      this.push(Buffer.from(b));
    }
    this.push(null);
  }
}

class Sink extends Writable {
  #bufs = [];
  _write(chunk, _encoding, cb) {
    this.#bufs.push(chunk);
    cb();
  }

  get str() {
    return Buffer.concat(this.#bufs).toString();
  }
}

function getInfo(file) {
  return {
    file,
    url: new URL('https://localhost:8112/test/fixtures/cgi.txt'),
    size: 12,
    dir: fileURLToPath(new URL('..', import.meta.url)),
    signal: null,
    headers: Object.create(null),
    log: {
      debug(..._args) {
        // For debugging.
        // console.log(..._args);
      },
    },
  };
}

function execCGI(bin, file, ...args) {
  return new Promise((resolve, reject) => {
    const info = getInfo(file);
    const c = new CGI(null, bin, info, ...args);
    let headersFired = false;
    c.on('headers', () => {
      headersFired = true;
    });
    const s = new Sink();
    pipeline(new Source('{"foo": true}'), c, s, er => {
      if (er) {
        reject(er);
        return;
      }
      resolve({
        size: info.size,
        headers: info.headers,
        stdout: s.str,
        headersFired,
      });
    });
  });
}

test('CGI', async () => {
  const {size, headers, headersFired, stdout} =
    await execCGI(CHUNKS, CRLF_FILE);
  assert.equal(headersFired, true);
  assert.equal(size, undefined);
  assert.deepEqual(headers, {
    'content-type': 'text/html',
    'x-foo': 'bar',
  });
  await snap('cgi crlf', stdout)
    .then(expected => {
      assert.equal(stdout, expected);
    });

  await assert.rejects(() => execCGI('__NO_SUCH_BIN__', CRLF_FILE));
  await assert.rejects(() => execCGI(CHUNKS, '__NO__SUCH_FILE__'));
  const one = await execCGI(CHUNKS, CRLF_FILE, 1, 16);
  assert.equal(one.headers['content-type'], 'text/html');

  await assert.rejects(() => execCGI(CHUNKS, LF_FILE));
  await assert.rejects(() => execCGI(CHUNKS, CRLF_FILE, 'signal'));
  await assert.rejects(() => execCGI(CHUNKS, CRLF_FILE, 24, -67));
});
