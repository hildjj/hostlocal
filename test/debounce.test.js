import assert from 'node:assert';
import {debounce} from '../lib/debounce.js';
import test from 'node:test';

test('debounce', async() => {
  let count = 0;
  await new Promise((resolve, reject) => {
    const deb = debounce(() => {
      count++;
      if (count > 1) {
        reject(new Error('Too many bounce'));
      } else {
        setTimeout(resolve, 200);
      }
    }, 100);
    deb();
    deb();
    setTimeout(deb, 50);
  });
  assert.equal(count, 1);
});
