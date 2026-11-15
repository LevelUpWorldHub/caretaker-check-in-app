export class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return true;
  }
  if (error instanceof HttpStatusError) {
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }
  return false;
}

export async function withResilience<T>(
  fn: (signal: AbortSignal, attempt: number) => Promise<T>,
  options: {
    timeoutMs: number;
    retries?: number;
    retryOn?: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
    backoffMs?: (attempt: number) => number;
  },
): Promise<{ value: T; attempts: number }> {
  const retries = options.retries ?? 0;
  const retryOn = options.retryOn ?? (() => false);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const backoffMs = options.backoffMs ?? ((attempt: number) => 200 * attempt);
  let last: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(options.timeoutMs);
      const value = await fn(signal, attempt);
      return { value, attempts: attempt };
    } catch (error) {
      last = error;
      if (!retryOn(error) || attempt > retries) break;
      await sleep(backoffMs(attempt));
    }
  }
  if (last instanceof Error) throw last;
  throw new Error("Request failed");
}
