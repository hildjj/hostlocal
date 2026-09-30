import {WatchSet} from '../lib/watchSet.js';
import assert from 'node:assert/strict';
import test from 'node:test';

test('WatchSet', () => {
  const ws = new WatchSet({wait: 1000});
  assert.doesNotThrow(() => ws.remove('not there'));
  ws.close();
});
