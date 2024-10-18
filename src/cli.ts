#!/usr/bin/env node

import {
  Command,
  InvalidArgumentError,
  Option,
  OutputConfiguration,
} from 'commander';
import {DEFAULT_HOST_OPTIONS} from './opts.js';
import {hostLocal} from './index.js';
import {version} from './version.js';

function appendArray(val: string, prev: string[] | undefined): string[] {
  prev ??= [];
  prev.push(val);
  return prev;
}

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
    .option('-6, --ipv6', 'Listen on IPv6 only, if host supports both IPv4 and IPv6.')
    .option('-c, --config <file>', `If the given file exists, import it as a module and use its default export as the options.  Name is relative to cwd. Command line parameters overwrite options from the config file. (default: "${DEFAULT_HOST_OPTIONS.config}")`)
    .option('--certDir <directory>', `Directory, relative to cwd, to cache cert info. (default: "${DEFAULT_HOST_OPTIONS.certDir}")`)
    .option('-g, --glob <pattern>', 'Set of files to watch.  If one of these changes, execute the command in the --exec option.  Can be specified multiple times.', appendArray)
    .option('-e, --exec <shell command>', `Execute this command when the glob changes. (default: "${DEFAULT_HOST_OPTIONS.exec}")`)
    .option('-H, --host <address>', 'Hostname or IP address to listen on. "::" for everything. (default: "localhost")')
    .option('-i, --initial', 'If glob is specified, run the exec command on startup, before listening')
    .option('--notAfterDays <number>', `How many days is the certificate valid? (default: ${DEFAULT_HOST_OPTIONS.notAfterDays})`, toInt)
    .option('-o, --open <path>', `Open this path in the default browser.  Relative to server root and prefix, if specified.  If empty (""), do not open anything. (default: "${DEFAULT_HOST_OPTIONS.open}")`)
    .option('-p, --port <number>', `Port to serve content from.  Use 0 to get an unused port. (default: ${DEFAULT_HOST_OPTIONS.port})`, toInt)
    .option('-P, --prefix <string>', 'Make all of the URLs served have paths that start with this prefix, followed by a slash.')
    .option('-q, --quiet', 'Do not do logging')
    .option('--rawMarkdown', 'Do not process markdown into HTML')
    .option('-t, --timeout <number>', 'Time, in ms, to allow exec to run.', toInt)
    .addOption(
      // Testing only
      new Option('--shutTimes <number>')
        .argParser(toInt)
        .hideHelp()
    )
    .argument('[directory]', 'Directory to serve. (default: cwd)')
    .configureHelp({
      sortOptions: true,
    })
    .action((directory, opts) => hostLocal(directory, opts))
    .parseAsync(args);
}
