import {type FSWatcher, default as chokidar} from 'chokidar';
import {EventEmitter} from 'node:events';
import {debounce} from './debounce.js';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';

export interface WatchOptions {

  /**
   * Working directory for glob and exec.
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Globs to watch.
   * @see https://nodejs.org/api/fs.html#fspromisesglobpattern-options
   */
  glob?: string[] | null;

  /**
   * Run exec when starting up?
   */
  initial?: boolean;

  /**
   * Command to run when glob changes.
   */
  exec: string;

  /**
   * Debounce changes by this amount of time in milliseconds.
   * @default 100
   */
  debounce?: number;

  /**
   * Abort signal to watch to halt watching and child process execution.
   */
  signal?: AbortSignal | null;

  /**
   * Time, in ms, to allow exec to run.
   * @default 30000
   */
  timeout?: number | null;
}

export const watchTiming = {
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
};

export class WatchGlob extends EventEmitter {
  #glob: string | string[];
  #cmd: string;
  #cwd: string;
  #debounceTimout: number;
  #initial: boolean;
  #signal: AbortSignal | undefined;
  #timeout: number | undefined;
  #watch: FSWatcher | undefined = undefined;

  /**
   * Create a WatchGlob.
   *
   * @param options Options for watching.
   */
  public constructor(options: WatchOptions) {
    super();

    if (!options.exec) {
      throw new TypeError('exec is required');
    }
    if (!options.glob ||
        (Array.isArray(options.glob) && (options.glob.length === 0))) {
      throw new TypeError('glob is required');
    }

    this.#glob = options.glob;
    this.#cwd = options.cwd ?? process.cwd();
    this.#cmd = options.exec;
    this.#initial = Boolean(options.initial);
    this.#debounceTimout = options.debounce ?? 100;
    this.#signal = options.signal ?? undefined;
    this.#timeout = options.timeout ?? undefined;

    this.#signal?.addEventListener('abort', () => {
      if (this.#watch) {
        this.close();
      }
    });
  }

  /**
   * Begin watching the glob.
   */
  public async start(): Promise<void> {
    if (this.#watch) {
      throw new Error('Already watching');
    }

    const allFiles = await Array.fromAsync(
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      fs.glob(this.#glob, {cwd: this.#cwd})
    );
    this.#watch = chokidar.watch(allFiles, {...watchTiming, cwd: this.#cwd});
    const exec = debounce(() => this.#exec(), this.#debounceTimout);
    this.#watch.on('change', f => {
      this.emit('change', f);
      exec().catch((er: unknown) => this.emit('error', er));
    });
    this.emit('start');
    if (this.#initial) {
      await this.#exec();
    }
  }

  /**
   * Stop watching the glob.
   */
  public async close(): Promise<void> {
    if (!this.#watch) {
      throw new Error('Not watching');
    }
    const w = this.#watch;
    this.#watch = undefined; // Help prevent double-close
    await w.close();
    this.emit('close');
  }

  #exec(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.#cmd, {
        shell: true,
        cwd: this.#cwd,
        stdio: 'inherit',
        windowsHide: true,
        signal: this.#signal,
        timeout: this.#timeout,
      });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (signal) {
          reject(new Error(`exited ${this.#cmd} due to signal ${signal}`));
        } else if (code) {
          reject(new Error(`exited "${this.#cmd}" with code ${code}`));
        } else {
          resolve();
        }
      });
    }).then(() => {
      this.emit('exec');
    }, (er: unknown) => {
      this.emit('error', er);
    });
  }
}
