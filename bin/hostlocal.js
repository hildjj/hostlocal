#!/usr/bin/env node

import {cli} from '../lib/cli.js';

const ac = new AbortController();
if (process.platform !== 'win32') {
  // No clean shutdown on windows
  process.on('SIGINT', sig => {
    ac.abort(sig);
  });
}
await cli(undefined, undefined, ac.signal);
