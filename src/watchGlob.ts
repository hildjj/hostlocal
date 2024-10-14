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
   * Glob to watch.
   * @see https://nodejs.org/api/fs.html#fspromisesglobpattern-options
   */
  glob: string;

  /**
   * Command to run when glob changes.
   */
  shellCommand: string;

  /**
   * Debounce changes by this amount of time in milliseconds.
   * @default 100
   */
  debounce?: number;

  /**
   * Abort signal to watch to halt watching and child process execution.
   */
  signal?: AbortSignal | null;
}

export const watchTiming = {
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
};

export class WatchGlob extends EventEmitter {
  #glob: string;
  #cmd: string;
  #cwd: string;
  #debounceTimout: number;
  #signal: AbortSignal | undefined;
  #watch: FSWatcher | undefined = undefined;

  /**
   * Create a WatchGlob.
   *
   * @param options Options for watching.
   */
  public constructor(options: WatchOptions) {
    super();
    this.#glob = options.glob;
    this.#cwd = options.cwd ?? process.cwd();
    this.#cmd = options.shellCommand;
    this.#debounceTimout = options.debounce ?? 100;
    this.#signal = options.signal ?? undefined;

    if (!this.#cmd) {
      throw new RangeError('No shellCommand specified');
    }
    if (!this.#glob) {
      throw new RangeError('No glob specified');
    }
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
