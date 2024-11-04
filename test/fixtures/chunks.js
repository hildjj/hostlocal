#!/usr/bin/env node
import fs from 'node:fs';

// Usage: chunks.js <file> [offset...]
// Writes out the given file in the provided chunks, with one chunk at the
// end if needed.

try {
  const argv = process.argv.slice(2);
  const buf = fs.readFileSync(argv.shift());

  let cur = 0;
  function out() {
    if (argv.length === 0) {
      if (cur < buf.length - 1) {
        // console.error(cur, 'END');
        process.stdout.write(buf.subarray(cur), er => {
          if (er) {
            console.error('ERROR in chunks', er.message);
            process.exit(1);
          }
        });
      }
    } else {
      const offset = parseInt(argv.shift(), 10);
      if (isNaN(offset)) {
        // Sneaky way to get a signal to kill us.
        process.kill(process.pid, 'SIGINT');
      }
      if (offset < 0) {
        // Sneaky way to exit at a given place, with a one-char substitution
        process.stdout.end(String.fromCodePoint(-offset));
        process.exit(0);
      }
      if (offset <= cur) {
        throw new Error('Invalid offset list');
      }
      // console.error(cur, offset)
      process.stdout.write(buf.subarray(cur, offset), er => {
        if (er) {
          console.error('ERROR in chunks', er.message);
          process.exit(1);
        }
        cur = offset;
        // This is enough to disable Nagle, apparently
        setTimeout(out, 0);
      });
    }
  }

  out();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
