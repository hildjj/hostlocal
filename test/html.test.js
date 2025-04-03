import {AddClient} from '../lib/html.js';
import assert from 'node:assert';
import test from 'node:test';

test('addClient append', () => {
  const a = new AddClient({}, false);
  assert.equal(a.append, false);
  a.append = true;
  assert.equal(a.append, true);
});
