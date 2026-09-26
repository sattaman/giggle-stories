/** Runs at most `limit` of the functions given to it at once, in the order they were given. */
export type Limiter = <R>(fn: () => Promise<R>) => Promise<R>;

export function createLimiter(limit: number): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = (): void => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <R>(fn: () => Promise<R>): Promise<R> => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
