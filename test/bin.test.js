import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import test from 'node:test';

const bin = fileURLToPath(new URL('../bin/hostlocal.js', import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-bin-'));

test.after(async () => {
  await fs.rm(tmp, {recursive: true, force: true});
});

test(
  'binary shuts down cleanly on SIGINT',
  () => new Promise((resolve, reject) => {
    const child = spawn(process.argv0, [
      bin,
      '--certDir',
      tmp,
      '--open',
      '',
      '--port',
      '9115',
    ], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', buf => {
      const s = buf.toString();
      if (s.match('Listening on:')) {
        child.kill('SIGINT');
      }
    });
    child.on('close', (code, signal) => {
      try {
        assert.equal(code, 0);
        assert.equal(signal, null);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    child.on('error', reject);
  })
);
