import {pino} from 'pino';
import pretty from 'pino-pretty';

export interface LogOptions {

  /** Increase (or decrease if negative) log verbosity by this much. */
  logLevel?: number;

  /** If a string, create this log file and write to it. */
  logFile?: string | null;

  /** Pino logger. */
  log?: pino.Logger;
}

export type RequiredLogOptions = Required<LogOptions>;

const multi = pino.multistream([
  pretty({
    ignore: 'pid,hostname,name,host,port',
  }),
]);

export const DEFAULT_LOG_OPTIONS: RequiredLogOptions = {
  logFile: null,
  logLevel: 0,
  log: pino({
    name: 'localhost',
  }, multi),
};

/**
 * Set up logging based on normalized options.
 *
 * @param opts Logging options.
 */
export function setLogLevel(opts: RequiredLogOptions): void {
  let level = Math.round(3 - opts.logLevel);
  if (level < 1) {
    level = 1;
  } else if (level > 6) {
    level = 6;
  }
  if (opts.logFile) {
    multi.add(pino.destination({
      dest: opts.logFile,
      sync: false,
      append: true,
      mkdir: true,
    }));
  }
  opts.log.level = pino.levels.labels[level * 10];
}
