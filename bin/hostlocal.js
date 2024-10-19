#!/usr/bin/env node

import {cli} from '../lib/cli.js';

const ac = new AbortController();
process.on('SIGINT', sig => {
  ac.abort(sig);
});
await cli(undefined, undefined, ac.signal);
