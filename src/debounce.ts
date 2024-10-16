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

/**
 * Collect a set of things until they stop coming in for a while.
 * @template T The type of thing to collect.
 */
export class DebounceSet<T = string> {
  #fn: SetFunction<T>;
  #contents = new Set<T>();
  #wait: number;
  #timeout: NodeJS.Timeout | undefined = undefined;
  #signal: AbortSignal | undefined = undefined;

  public constructor(
    fn: SetFunction<T>,
    wait: number,
    signal?: AbortSignal | null
  ) {
    this.#fn = fn;
    this.#wait = wait;
    this.#signal = signal ?? undefined;
    this.#signal?.addEventListener('abort', () => {
      if (this.#timeout) {
        clearTimeout(this.#timeout);
      }
      this.#notify();
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
    this.#timeout = setTimeout(() => this.#notify(), this.#wait);
  }

  #notify(): void {
    this.#fn([...this.#contents]);
    this.#contents.clear();
  }
}
