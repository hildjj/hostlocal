import {pino} from 'pino';
import pretty from 'pino-pretty';

export interface LogOptions {

  /**
   * Increase (or decrease if negative) log verbosity by this much.
   * -3: fatal, -2: error, -1: warn, 0: info, 1: debug, 2: trace.
   */
  logLevel?: number;

  /** If a string, create this log file and write to it. */
  logFile?: string | null;

  /** Pino logger. */
  log?: pino.Logger;
}

export type RequiredLogOptions = Required<LogOptions>;

export const DEFAULT_LOG_OPTIONS: RequiredLogOptions = {
  logFile: null,
  logLevel: 0,
  log: pino({
    redact: ['log'],
  }, pretty({
    ignore: 'pid,hostname,name,host,port',
  })),
};

/**
 * Set up logging based on normalized options.
 *
 * @param opts Logging options.
 * @param bindings Extra fields to put into every log item.
 */
export function setLogLevel(
  opts: RequiredLogOptions,
  bindings: pino.Bindings = {}
): void {
  let levelNum = Math.round(3 - opts.logLevel);
  if (levelNum < 1) {
    levelNum = 1;
  } else if (levelNum > 6) {
    levelNum = 6;
  }
  const level = pino.levels.labels[levelNum * 10];

  if (opts.logFile) {
    const multi = pino.multistream([
      {
        level,
        stream: pino.destination({
          dest: opts.logFile,
          sync: false,
          append: true,
          mkdir: true,
        }),
      },
      {
        level,
        stream: pretty({
          ignore: 'pid,hostname,name,host,port',
        }),
      },
    ]);
    opts.log = pino({level, redact: ['log']}, multi);
  } else {
    opts.log.level = level;
  }
  opts.log.setBindings(bindings);
}
