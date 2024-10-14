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
export function debounce<T extends (...args: any[]) => any>(
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
