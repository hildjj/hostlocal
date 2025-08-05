import {DebounceSet, debounce} from '../lib/debounce.js';
import assert from 'node:assert';
import test from 'node:test';

test('debounce', async () => {
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

test('debounceSet', () => new Promise((resolve, reject) => {
  const called = [];
  const s = new DebounceSet(all => called.push(all), 100);
  s.add('one');
  s.add('two');

  setTimeout(() => {
    try {
      assert.deepEqual(called, [['one', 'two']]);
      resolve();
    } catch (er) {
      reject(er);
    }
  }, 200);
}));

test('debounceSet signal', () => {
  const called = [];
  const ac = new AbortController();
  const s = new DebounceSet(all => called.push(all), {
    wait: 100000,
    signal: ac.signal,
  });
  s.add('one');
  s.add('two');
  ac.abort('test');
  assert.deepEqual(called, [['one', 'two']]);
});

test('debounceSet signal nonePending', () => {
  const called = [];
  const ac = new AbortController();
  const s = new DebounceSet(all => called.push(all), {
    wait: 100000,
    signal: ac.signal,
  });
  ac.abort('test');
  assert.deepEqual(called, []);
  s.close();
  assert.deepEqual(called, []);
});
