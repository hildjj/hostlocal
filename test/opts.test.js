import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import {normalizeOptions} from '../lib/opts.js';
import test from 'node:test';

test('invalid config file', async () => {
  const invalid = fileURLToPath(new URL('./fixtures/invalid.js', import.meta.url));
  await assert.rejects(() => normalizeOptions({
    config: invalid,
  }));
});

test('single glob', async () => {
  const opts = await normalizeOptions({
    glob: 'foo',
  });
  assert.deepEqual(opts.glob, ['foo']);
});

test('prefix', async () => {
  let opts = await normalizeOptions({});
  assert.deepEqual(opts.prefix, '');

  opts = await normalizeOptions({prefix: null});
  assert.deepEqual(opts.prefix, '');

  opts = await normalizeOptions({prefix: 'foo'});
  assert.deepEqual(opts.prefix, '/foo');

  opts = await normalizeOptions({prefix: './foo/bar/'});
  assert.deepEqual(opts.prefix, '/foo/bar');
});
