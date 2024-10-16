import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import {normalizeOptions} from '../lib/opts.js';
import test from 'node:test';

test('invalid config file', async() => {
  const invalid = fileURLToPath(new URL('./fixtures/invalid.js', import.meta.url));
  await assert.rejects(() => normalizeOptions({
    config: invalid,
  }));
});

test('single glob', async() => {
  const opts = await normalizeOptions({
    glob: 'foo',
  });
  assert.deepEqual(opts.glob, ['foo']);
});
