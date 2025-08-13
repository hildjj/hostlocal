export type AnyFunction = (...args: any[]) => any;

/**
 * Wrap a function so that it only fires after it hasn't been called again
 * for some amount of time.  This othrewise-simple function exists to get
 * the TypeScript types correct.
 *
 * @template T Type signature of wrapped function.
 * @param fn Function to wrap.
 * @param wait Time to wait, in ms.
 * @returns Wrapper function.
 */
export function debounce<T extends AnyFunction>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeout: NodeJS.Timeout | undefined = undefined;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => new Promise(
    resolve => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => resolve(fn(...args)), wait);
    }
  );
}

export type SetFunction<T> = (all: T[]) => void;
export interface DebounceOptions {
  wait: number;
  signal?: AbortSignal;
}

/**
 * Collect a set of things until they stop coming in for a while.
 * @template T The type of thing to collect.
 */
export class DebounceSet<T = string> {
  #fn: SetFunction<T>;
  #opts: DebounceOptions;
  #contents = new Set<T>();
  #timeout: NodeJS.Timeout | undefined = undefined;

  public constructor(fn: SetFunction<T>, opts: DebounceOptions) {
    this.#fn = fn;
    this.#opts = opts;
    this.#opts.signal?.addEventListener('abort', () => {
      this.close();
    });
  }

  /**
   * Add an item to the set.  After wait ms, call fn.
   *
   * @param item The item to add.  Uses Set rules for matching.
   */
  public add(item: T): void {
    if (this.#timeout) {
      clearTimeout(this.#timeout);
    }
    this.#contents.add(item);
    this.#timeout = setTimeout(() => this.#notify(), this.#opts.wait);
  }

  /**
   * Delete all pending notifications.
   */
  public clear(): void {
    if (this.#timeout) {
      clearTimeout(this.#timeout);
    }
    this.#contents.clear();
  }

  public close(): void {
    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }
    this.#notify();
  }

  #notify(): void {
    if (this.#contents.size > 0) {
      this.#fn([...this.#contents]);
      this.#contents.clear();
    }
  }
}
