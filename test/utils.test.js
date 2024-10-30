import assert from 'node:assert';
import {parseIfNoneMatch} from '../lib/utils.js';
import test from 'node:test';

test('parseEtag', () => {
  assert.deepEqual(parseIfNoneMatch(undefined), undefined);
  assert.deepEqual(parseIfNoneMatch(null), undefined);
  assert.deepEqual(parseIfNoneMatch(''), new Set());
  assert.deepEqual(parseIfNoneMatch('*'), new Set(['*']));
  assert.deepEqual(parseIfNoneMatch('"foo"'), new Set(['"foo"']));
  assert.deepEqual(parseIfNoneMatch('W/"foo"'), new Set(['"foo"']));
  assert.deepEqual(parseIfNoneMatch('"foo", "bar"'), new Set(['"foo"', '"bar"']));
  assert.deepEqual(parseIfNoneMatch('W/"foo", W/"bar"'), new Set(['"foo"', '"bar"']));
  assert.deepEqual(
    parseIfNoneMatch('W/"foo", W/"bar", "boo,baz"'),
    new Set(['"foo"', '"bar"', '"boo,baz"'])
  );
});
