import { it, expect, vi } from "vitest";
import { retryUnavailable } from "../src/server/ai-retry";
it("reserves budget before exactly one 503 retry", async () => {
  const order: string[] = [];
  let calls = 0;
  expect(
    await retryUnavailable(
      async () => {
        order.push("request");
        if (++calls === 1) throw { status: 503 };
        return "ok";
      },
      async () => {
        order.push("reserve");
      },
      async () => {},
    ),
  ).toBe("ok");
  expect(order).toEqual(["request", "reserve", "request"]);
});
it("does not repeat authentication, quota or invalid-output failures", async () => {
  for (const status of [400, 401, 403, 429]) {
    const request = vi.fn(async () => {
        throw { status };
      }),
      reserve = vi.fn();
    await expect(
      retryUnavailable(request, reserve, async () => {}),
    ).rejects.toEqual({ status });
    expect(request).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
  }
});
it("budget failure blocks the second request and persistent 503 stops after two", async () => {
  const request = vi.fn(async () => {
    throw { status: 503 };
  });
  await expect(
    retryUnavailable(
      request,
      async () => {
        throw Error("budget");
      },
      async () => {},
    ),
  ).rejects.toThrow("budget");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockClear();
  await expect(
    retryUnavailable(
      request,
      async () => {},
      async () => {},
    ),
  ).rejects.toEqual({ status: 503 });
  expect(request).toHaveBeenCalledTimes(2);
});
