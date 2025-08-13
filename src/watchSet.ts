import {type DebounceOptions, DebounceSet} from './debounce.js';
import chokidar, {type FSWatcher} from 'chokidar';
import {EventEmitter} from 'node:events';
import path from 'node:path';

interface WatchSetEvents {
  change: [files: string[]];
  close: [];
  error: [error: unknown];
}

/**
 * Watch an expanding set of files for changes.
 * Initially, no files are watched.  Use add() to watch.
 */
export class WatchSet extends EventEmitter<WatchSetEvents> {
  #ac = new AbortController();
  #set: DebounceSet<string>;
  #watcher: FSWatcher;

  public constructor(opts: DebounceOptions) {
    super();
    opts.signal?.addEventListener('abort', () => this.#ac.abort());
    this.#set = new DebounceSet((files: string[]) => {
      this.emit('change', files);
    }, {
      ...opts,
      signal: this.#ac.signal,
    });
    this.#watcher = chokidar.watch([], {
      atomic: true,
      ignoreInitial: true,
    });
    this.#ac.signal.addEventListener('abort', () => {
      this.#watcher.close();
      this.emit('close');
    });

    this.#watcher.on('change', f => this.#set.add(f));
    this.#watcher.on('add', f => this.#set.add(f));
    // Re-add to the watcher, so add will eventually fire
    this.#watcher.on('unlink', f => this.#watcher.add(f));
    this.#watcher.on('error', er => this.emit('error', er));
  }

  /**
   * Add a file to the watched set.
   *
   * @param file Full path to file.
   * @returns Self, for chaining.
   */
  public add(file: string): this {
    this.#watcher.add(file);
    return this;
  }

  /**
   * Remove a file from consideration.
   *
   * @param file Full path to file.
   * @returns Self, for chaining.
   */
  public remove(file: string): this {
    this.#watcher.unwatch(file);
    return this;
  }

  /**
   * Send change notifications for every watched file.
   *
   * @returns Self, for chaining.
   */
  public changeAll(): this {
    this.#set.clear();
    const all: string[] = [];
    for (const [dir, files] of Object.entries(this.#watcher.getWatched())) {
      for (const f of files) {
        const fn = path.join(dir, f);
        all.push(fn);
      }
    }
    this.emit('change', all);
    return this;
  }

  /**
   * Stop watching files. Not needed if you have used signal in the options.
   * @returns Self, for chaining.
   */
  public close(): this {
    this.#ac.abort();
    return this;
  }
}
