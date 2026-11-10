import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ping: vi.fn(),
  get: vi.fn(),
}));
vi.mock("../src/server/db", () => ({ getDb: () => ({ query: mocks.query }) }));
vi.mock("../src/server/redis", () => ({
  getRedis: () => ({ ping: mocks.ping, get: mocks.get }),
}));
import { getHealth } from "../src/server/health";

describe("health is based on actual evidence", () => {
  beforeEach(() => {
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });
    mocks.ping.mockResolvedValue("PONG");
    mocks.get.mockResolvedValue(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        instanceId: "test",
      }),
    );
  });
  it("does not infer provider connectivity from healthy infrastructure", async () => {
    const report = await getHealth();
    expect(report.status).toBe("healthy");
    expect(
      report.checks
        .filter((c) => ["market", "news", "gemini"].includes(c.id))
        .every((c) => ["offline", "not_configured"].includes(c.state)),
    ).toBe(true);
  });
  it("ages successful provider checks independently", async () => {
    mocks.query.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          name: "market",
          state: "online",
          checked_at: new Date(Date.now() - 300000),
          success_at: new Date(Date.now() - 300000),
          detail: "REST synchronized",
        },
        {
          name: "news",
          state: "online",
          checked_at: new Date(),
          success_at: new Date(),
          detail: "RSS synchronized",
        },
      ],
    });
    const report = await getHealth();
    expect(report.checks.find((c) => c.id === "market")?.state).toBe("stale");
    expect(report.checks.find((c) => c.id === "news")?.state).toBe("online");
  });
  it("does not mistake a reachable but unmigrated database for ready", async () => {
    mocks.query.mockResolvedValue({ rowCount: 0 });
    expect((await getHealth()).status).toBe("degraded");
  });
  it("rejects stale and future worker heartbeats", async () => {
    for (const timestamp of [
      new Date(Date.now() - 100000).toISOString(),
      new Date(Date.now() + 100000).toISOString(),
    ]) {
      mocks.get.mockResolvedValue(
        JSON.stringify({ timestamp, instanceId: "test" }),
      );
      expect(
        (await getHealth()).checks.find((c) => c.id === "worker")?.state,
      ).toBe("stale");
    }
  });
  it("handles corrupt heartbeat data", async () => {
    mocks.get.mockResolvedValue("invalid-json");
    expect(
      (await getHealth()).checks.find((c) => c.id === "worker")?.state,
    ).toBe("offline");
  });
  it("sanitizes dependency failure details", async () => {
    mocks.query.mockRejectedValue(new Error("postgres://secret:password@host"));
    mocks.ping.mockRejectedValue(new Error("redis://password@host"));
    const result = await getHealth();
    expect(result.status).toBe("degraded");
    expect(JSON.stringify(result)).not.toContain("password");
    expect(result.checks.find((c) => c.id === "worker")?.state).not.toBe(
      "online",
    );
  });
});
