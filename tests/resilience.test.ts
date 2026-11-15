import { describe, expect, it } from "vitest";
import { HttpStatusError, isRetryable, withResilience } from "@/lib/resilience";

describe("resilience", () => {
  it("retries a temporary failure and then returns the value", async () => {
    let calls = 0;
    const result = await withResilience(
      async () => {
        calls += 1;
        if (calls < 3) throw new HttpStatusError(503);
        return "ok";
      },
      {
        timeoutMs: 50,
        retries: 2,
        retryOn: isRetryable,
        sleep: async () => {},
      },
    );
    expect(result).toEqual({ value: "ok", attempts: 3 });
    expect(calls).toBe(3);
  });

  it("does not retry an expired token", async () => {
    let calls = 0;
    await expect(
      withResilience(
        async () => {
          calls += 1;
          throw new HttpStatusError(401);
        },
        { timeoutMs: 50, retries: 2, retryOn: isRetryable, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(HttpStatusError);
    expect(calls).toBe(1);
  });

  it("stops on a timeout without touching the network", async () => {
    await expect(
      withResilience(
        async (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              const error = new Error("timed out");
              error.name = "TimeoutError";
              reject(error);
            });
          }),
        { timeoutMs: 20, retries: 0, retryOn: isRetryable },
      ),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
