#!/usr/bin/env node

import {
  Argument,
  Command,
  InvalidArgumentError,
  OutputConfiguration,
} from 'commander';
import {DEFAULT_HOST_OPTIONS, hostLocal} from './index.js';
import {version} from './version.js';

function toInt(val: string): number {
  const ret = parseInt(val, 10);
  if (isNaN(ret)) {
    throw new InvalidArgumentError('not a valid integer.');
  }
  return ret;
}

/**
 * Run the CLI for the given arguments.
 *
 * @param args Arguments to process, in node format.  If not specified, uses
 *   process.argv.
 * @param out Override stdout and stderr for testing.
 */
export async function cli(
  args?: string[],
  out?: OutputConfiguration
): Promise<void> {
  const program = new Command();
  if (out) {
    program.configureOutput(out);
    program.exitOverride();
  }

  // Set default docs manually.
  await program
    .version(version)
    .option('-c, --config <file>', `If the given file exists, import it as a module and use its default export as the options.  Name is relative to cwd. Command line parameters overwrite options from the config file. (default: "${DEFAULT_HOST_OPTIONS.config}")`)
    .option('--certDir <directory>', `Directory, relative to cwd, to cache cert info. (default: "${DEFAULT_HOST_OPTIONS.certDir}")`)
    .option('--notAfterDays <number>', `How many days is the certificate valid? (default: ${DEFAULT_HOST_OPTIONS.notAfterDays})`, toInt)
    .option('-o, --open <path>', `Open this path in the default browser.  Relative to server root.  If empty, do not open anything. (default: "${DEFAULT_HOST_OPTIONS.open}")`)
    .option('-p, --port <number>', `Port to serve content from. (default: ${DEFAULT_HOST_OPTIONS.port})`, toInt)
    .option('-q, --quiet', 'Do not do logging')
    .addArgument(new Argument('[directory]', 'Directory to serve').default(process.cwd(), 'cwd'))
    .action((directory, opts) => hostLocal(directory, opts))
    .parseAsync(args);
}
