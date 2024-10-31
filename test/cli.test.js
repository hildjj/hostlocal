import assert from 'node:assert';
import {cli} from '../lib/cli.js';
import snap from 'snappy-snaps';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import test from 'node:test';

test('help', async() => {
  let stdout = '';
  let stderr = '';
  const out = {
    writeOut(str) {
      stdout += str;
    },
    writeErr(str) {
      stderr += str;
    },
  };
  await assert.rejects(() => cli(['node', 'hostlocal', '-h'], out));
  assert.deepEqual(stdout, await snap('help stdout', stdout));
  assert.deepEqual('', await snap('help stderr', stderr));

  // eslint-disable-next-line require-atomic-updates
  stdout = '';
  // eslint-disable-next-line require-atomic-updates
  stderr = '';
  await assert.rejects(() => cli(['node', 'hostlocal', '-p', 'aaaa'], out));
  assert.deepEqual('', await snap('parse stdout', stdout));
  assert.deepEqual(stderr, await snap('parse stderr', stderr));
});
