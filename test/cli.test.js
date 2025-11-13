import assert from 'node:assert';
import {cli} from '../lib/cli.js';
import snap from 'snappy-snaps';
import test from 'node:test';

async function runCli(...args) {
  let stdout = '';
  let stderr = '';
  let err = undefined;

  try {
    await cli([process.argv0, 'hostlocal', ...args], {
      writeOut: str => (stdout += str),
      writeErr: str => (stderr += str),
      outputError: (str, write) => write(str),
      getOutHelpWidth: () => 80,
      getErrHelpWidth: () => 80,
      getOutHasColors: () => false,
    });
  } catch (e) {
    err = e;
  }

  return {
    stdout,
    stderr,
    err,
  };
}

test('help', async () => {
  const res = await runCli('-h');
  assert.equal(res.err.code, 'commander.helpDisplayed');
  assert.deepEqual(res.stdout, await snap('help stdout', res.stdout));
  assert.deepEqual('', await snap('help stderr', res.stderr));
});

test('invalid port', async () => {
  const res = await runCli('-p', 'aaaa');
  assert.equal(res.err.code, 'commander.invalidArgument');
  assert.deepEqual('', await snap('parse stdout', res.stdout));
  assert.deepEqual(res.stderr, await snap('parse stderr', res.stderr));
});

test('multiple globs', async () => {
  const res = await runCli('-g', 'aaaa', '-g', 'bbbb', '-q', '-q', '-h');
  assert.equal(res.err.code, 'commander.helpDisplayed');
});
