import {WatchGlob} from '../lib/watchGlob.js';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hostlocal-test-watch-'));

test.after(async() => {
  await fs.rm(tmp, {recursive: true});
});

test('watchGlob', async() => {
  const newTxt = path.join(tmp, 'now.txt');
  await fs.writeFile(
    newTxt,
    `${new Date().toISOString()} before`,
    'utf8'
  );

  const wg = new WatchGlob({
    glob: '*.txt',
    cwd: tmp,
    shellCommand: `${process.argv0} -v`,
  });

  let count = 0;
  await new Promise((resolve, reject) => {
    wg.on('start', () => count++);
    wg.on('change', () => count++);
    wg.on('error', reject);
    wg.on('exec', async() => {
      count++;
      await wg.close();
    });
    wg.on('close', () => {
      resolve();
    });
    wg.start()
      .then(() => fs.writeFile(
        newTxt,
        `${new Date().toISOString()} after`,
        'utf8'
      ))
      .catch(reject);
  });
  assert.equal(count, 3);
});

test('watchGlob invalid', async() => {
  assert.throws(() => new WatchGlob());
  assert.throws(() => new WatchGlob({}));
  assert.throws(() => new WatchGlob({shellCommand: 'foo'}));

  const ac = new AbortController();
  const wg = new WatchGlob({
    glob: '*.js',
    cwd: tmp,
    shellCommand: `${process.argv0} -v`,
    signal: ac.signal,
  });

  await wg.start();

  await assert.rejects(() => wg.start());
  await new Promise((resolve, reject) => {
    wg.on('error', reject);
    wg.on('close', resolve);
    ac.abort('test');
  });
  await assert.rejects(() => wg.close());
});

test('watchGlob bad exec exit', async t => {
  if (process.platform === 'win32') {
    t.skip('Cannot count on bash shenanigans in win32');
    return;
  }
  const newTs = path.join(tmp, 'now.ts');
  await fs.writeFile(newTs, '', 'utf8');

  const wg = new WatchGlob({
    glob: '*.ts',
    cwd: tmp,
    shellCommand: 'exit 1',
  });
  await wg.start();
  await new Promise((resolve, reject) => {
    wg.on('exec', reject);
    wg.on('error', async() => {
      await wg.close();
      resolve();
    });

    fs.writeFile(
      newTs,
      `export const now = new Date(${new Date().getTime()});`,
      'utf8'
    ).catch(reject);
  });
});

test('watchGlob exec signal', async t => {
  if (process.platform === 'win32') {
    t.skip('Cannot count on bash shenanigans in win32');
    return;
  }
  const newTs = path.join(tmp, 'now.mts');
  await fs.writeFile(newTs, '', 'utf8');

  const wg = new WatchGlob({
    glob: '*.mts',
    cwd: tmp,
    shellCommand: 'kill $$', // Shell signals itself
  });
  await wg.start();
  await new Promise((resolve, reject) => {
    wg.on('exec', reject);
    wg.on('error', async() => {
      await wg.close();
      resolve();
    });

    fs.writeFile(
      newTs,
      `export const now = new Date(${new Date().getTime()});`,
      'utf8'
    ).catch(reject);
  });
});
