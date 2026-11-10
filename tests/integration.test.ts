import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../src/server/db";
import { closeRedis } from "../src/server/redis";
import {
  readSettings,
  saveSettings,
  RevisionConflict,
} from "../src/server/settings-repository";
import { getHealth, heartbeatKey } from "../src/server/health";
import { healthQueueName } from "../src/worker/queue";
import {
  readRiskWorkspace,
  mutateRisk,
  RiskRuleViolation,
} from "../src/server/risk-repository";
import {
  initialRiskPolicy,
  type RiskProfile,
  type PlanInput,
} from "../src/domain/risk";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { createAlert, scanMarkets } from "../src/server/technical-service";
import { transitionAlert, processAlerts } from "../src/server/alert-service";
import { reserveAi } from "../src/server/ai-service";
import { saveQuote } from "../src/server/market-service";
import { portfolioSummary } from "../src/server/portfolio-service";
import { listNews, newsContext, compactNews } from "../src/server/news-service";
import { classifyNews } from "../src/domain/news";

// Requires real local services. PostgreSQL database is ephemeral; Redis DB 15 is reserved for this suite.
const databaseName = `itrade_test_${process.pid}_${Date.now()}`;
const baseDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://itrade:itrade_local@127.0.0.1:54329/itrade";
const admin = new Pool({ connectionString: baseDatabaseUrl });
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.pathname = `/${databaseName}`;
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:63799");
redisUrl.pathname = "/15";
let worker: ChildProcess | undefined;
let redis: Redis;
let queue: Queue;
let createdDatabase = false;

async function stopWorker() {
  if (worker && worker.exitCode === null) {
    const done = once(worker, "exit");
    worker.kill();
    await done;
  }
  worker = undefined;
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  process.env.DATABASE_URL = databaseUrl.toString();
  process.env.REDIS_URL = redisUrl.toString();
  process.env.HEALTH_INTERVAL_MS = "2000";
  process.env.WORKER_STALE_AFTER_MS = "6000";
  await migrate();
  redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: null });
  await once(redis, "ready");
  queue = new Queue(healthQueueName, { connection: redis });
  await queue.obliterate({ force: true });
  await redis.del(heartbeatKey);
}, 20000);
afterAll(async () => {
  await stopWorker();
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
  if (redis) {
    await redis.del(heartbeatKey);
    redis.disconnect();
  }
  closeRedis();
  await closeDb();
  if (createdDatabase)
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

describe("real PostgreSQL and Redis foundation", () => {
  it("applies migrations idempotently", async () => {
    await migrate();
    const rows = await getDb().query("SELECT name FROM schema_migrations");
    expect(rows.rowCount).toBe(
      (await readdir("db/migrations")).filter((n) => n.endsWith(".sql")).length,
    );
    expect((await readSettings()).settings.marketProvider).toBe("coinbase");
  });
  it("roundtrips settings, audits the change and rejects a stale writer", async () => {
    const original = await readSettings();
    const saved = await saveSettings(
      {
        ...original.settings,
        marketProvider: "kraken",
        dailyAiRequestBudget: 0,
      },
      original.revision,
    );
    expect((await readSettings()).settings.marketProvider).toBe("kraken");
    expect(saved.revision).toBe(original.revision + 1);
    await expect(
      saveSettings(original.settings, original.revision),
    ).rejects.toBeInstanceOf(RevisionConflict);
    expect((await getDb().query("SELECT id FROM audit_events")).rowCount).toBe(
      1,
    );
  });
  it("rejects invalid settings without a write or audit record", async () => {
    const record = await readSettings();
    await expect(
      saveSettings(
        { ...record.settings, dailyAiRequestBudget: -1 },
        record.revision,
      ),
    ).rejects.toThrow();
    expect((await readSettings()).revision).toBe(record.revision);
    expect((await getDb().query("SELECT id FROM audit_events")).rowCount).toBe(
      1,
    );
  });
  it("reports missing worker despite reachable database and Redis", async () => {
    // Warm up the web-facing Redis connection, which deliberately does not queue offline requests.
    await getHealth();
    await delay(100);
    const health = await getHealth();
    expect(health.checks.find((c) => c.id === "database")?.state).toBe(
      "online",
    );
    expect(health.checks.find((c) => c.id === "redis")?.state).toBe("online");
    expect(health.checks.find((c) => c.id === "worker")?.state).toBe("offline");
    expect(health.status).toBe("degraded");
  });
  it("runs the actual scheduled worker independently of any web server", async () => {
    worker = spawn(
      process.execPath,
      ["--import", "tsx", "src/worker/index.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DISABLE_EXTERNAL_WORKERS: "1" },
        stdio: "pipe",
        windowsHide: true,
      },
    );
    // Drain output without exposing provider or infrastructure errors.
    worker.stdout?.resume();
    worker.stderr?.resume();
    const deadline = Date.now() + 15000;
    while (!(await redis.get(heartbeatKey)) && Date.now() < deadline)
      await delay(200);
    expect((await getHealth()).status).toBe("healthy");
    const first = JSON.parse((await redis.get(heartbeatKey))!);
    await delay(2400);
    const second = JSON.parse((await redis.get(heartbeatKey))!);
    expect(Date.parse(second.timestamp)).toBeGreaterThan(
      Date.parse(first.timestamp),
    );
    expect(await queue.getJobSchedulersCount()).toBe(1);
  }, 20000);
  it("rejects unsupported jobs, retries and retains exhausted failures", async () => {
    const job = await queue.add(
      "unsupported-test-job",
      {},
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 50 },
        removeOnFail: false,
      },
    );
    const deadline = Date.now() + 5000;
    while ((await job.getState()) !== "failed" && Date.now() < deadline)
      await delay(100);
    expect(await job.getState()).toBe("failed");
    const retained = await queue.getJob(job.id!);
    expect(retained?.attemptsMade).toBe(2);
    expect(retained?.failedReason).toBe("Unsupported job");
  });
  it("detects a stopped worker instead of leaving a green status", async () => {
    await stopWorker();
    await redis.set(
      heartbeatKey,
      JSON.stringify({
        instanceId: "stopped-test-worker",
        timestamp: new Date(Date.now() - 7000).toISOString(),
      }),
    );
    expect(
      (await getHealth()).checks.find((c) => c.id === "worker")?.state,
    ).toBe("stale");
    expect((await getHealth()).status).toBe("degraded");
  });
});

describe("persisted risk workspace", () => {
  const profile: RiskProfile = {
    account: {
      currency: "USD",
      equity: "100",
      availableCash: "100",
      peakEquity: "100",
      openRisk: "0",
      openPositions: 0,
      dayStartEquity: "100",
      weekStartEquity: "100",
      dayLoss: "0",
      weekLoss: "0",
      asOf: new Date().toISOString(),
    },
    policy: { ...initialRiskPolicy, maxAssetPercent: "100" },
  };
  const input: PlanInput = {
    asset: "BTC",
    currency: "USD",
    entry: "10",
    stop: "9.5",
    target: "11",
    entryFeePercent: "0",
    exitFeePercent: "0",
    slippagePercent: "0",
    quantityStep: "0.01",
    priceTick: "0.01",
    minNotional: "1",
    existingAssetValue: "0",
    groupOpenRisk: "0",
    group: "Test crypto group",
    timeframe: "1h",
    rationale: "Disposable integration test",
    stopMethod: "scenario",
  };
  const id = randomUUID();
  it("starts without fabricated balances and requires reconciliation acknowledgement", async () => {
    expect((await readRiskWorkspace()).profile.profile).toBeNull();
    await expect(
      mutateRisk({ action: "plan", id, input, profileRevision: 0 }),
    ).rejects.toBeInstanceOf(RiskRuleViolation);
  });
  it("persists a reconciled policy and rejects a stale profile update", async () => {
    await mutateRisk({
      action: "profile",
      profile,
      revision: 0,
      reconciled: true,
    });
    const record = (await readRiskWorkspace()).profile;
    expect(record.revision).toBe(1);
    expect(record.profile?.account.equity).toBe("100");
    await expect(
      mutateRisk({ action: "profile", profile, revision: 0, reconciled: true }),
    ).rejects.toBeInstanceOf(RevisionConflict);
  });
  it("recomputes the plan server-side and keeps immutable calculation evidence", async () => {
    await mutateRisk({ action: "plan", id, input, profileRevision: 1 });
    const plan = (await readRiskWorkspace()).plans[0];
    expect(plan.result.quantity).toBe("4");
    expect(plan.result.plannedLoss).toBe("2");
    expect(plan.profile.policy.riskPercent).toBe("2");
    await expect(
      mutateRisk({ action: "plan", id, input, profileRevision: 1 }),
    ).rejects.toBeInstanceOf(RevisionConflict);
    expect((await readRiskWorkspace()).plans).toHaveLength(1);
  });
  it("rejects currency mismatches, invalid stops and low reward plans", async () => {
    for (const changed of [
      { currency: "USDT" as const },
      { stop: "11" },
      { target: "10.1" },
    ]) {
      await expect(
        mutateRisk({
          action: "plan",
          id: randomUUID(),
          input: { ...input, ...changed },
          profileRevision: 1,
        }),
      ).rejects.toBeInstanceOf(RiskRuleViolation);
    }
    expect((await readRiskWorkspace()).plans).toHaveLength(1);
  });
  it("records an actual loss beyond the planned stop rather than clipping it", async () => {
    await mutateRisk({
      action: "outcome",
      id,
      revision: 0,
      netPnl: "-3",
      notes: "Hypothetical gap exceeded modeled risk",
    });
    const plan = (await readRiskWorkspace()).plans[0];
    expect(plan.outcome?.netPnl).toBe("-3");
    expect(plan.result.plannedLoss).toBe("2");
    await expect(
      mutateRisk({
        action: "outcome",
        id,
        revision: 0,
        netPnl: "4",
        notes: "stale overwrite",
      }),
    ).rejects.toBeInstanceOf(RevisionConflict);
  });
  it("preserves the plan's original policy after profile edits", async () => {
    await mutateRisk({
      action: "profile",
      profile: { ...profile, policy: { ...profile.policy, riskPercent: "1" } },
      revision: 1,
      reconciled: true,
    });
    const data = await readRiskWorkspace();
    expect(data.profile.profile?.policy.riskPercent).toBe("1");
    expect(data.plans[0].profile.policy.riskPercent).toBe("2");
    await expect(
      mutateRisk({
        action: "plan",
        id: randomUUID(),
        input,
        profileRevision: 1,
      }),
    ).rejects.toBeInstanceOf(RevisionConflict);
  });
});

describe("cross-module persistence and controls", () => {
  it("serializes concurrent alert creation and preserves lifecycle evidence", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createAlert(
          "test-concurrent",
          "BTC",
          "zone_entered",
          "high",
          { reason: "test fixture" },
          60,
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const id = results.find(Boolean)!;
    await transitionAlert(id, "acknowledged");
    await transitionAlert(id, "resolved");
    await expect(transitionAlert(id, "active")).rejects.toThrow();
    expect(
      (
        await getDb().query(
          "SELECT status FROM alert_events WHERE alert_id=$1 ORDER BY id",
          [id],
        )
      ).rows.map((r) => r.status),
    ).toEqual(["active", "acknowledged", "resolved"]);
    expect(
      await createAlert(
        "test-concurrent",
        "BTC",
        "zone_entered",
        "high",
        {},
        60,
      ),
    ).toBeNull();
  });
  it("expires alerts even when market data is absent", async () => {
    const id = await createAlert(
      "test-expire",
      "ETH",
      "zone_entered",
      "medium",
      {},
      1,
    );
    await getDb().query(
      "UPDATE alerts SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
    await processAlerts();
    expect(
      (await getDb().query("SELECT status FROM alerts WHERE id=$1", [id]))
        .rows[0].status,
    ).toBe("expired");
  });
  it("atomically enforces daily AI budget across concurrent reservations", async () => {
    const s = await readSettings();
    await saveSettings({ ...s.settings, dailyAiRequestBudget: 2 }, s.revision);
    const r = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => reserveAi(`test-${i}`, "test-model")),
    );
    expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(2);
    const current = await readSettings();
    await saveSettings(
      { ...current.settings, dailyAiRequestBudget: 0 },
      current.revision,
    );
  });
  it("rejects stale and out-of-order quotes without overwriting fresh evidence", async () => {
    const timestamp = new Date().toISOString();
    const q = {
      asset: "BTC",
      provider: "kraken",
      currency: "USD",
      price: "100",
      bid: "99",
      ask: "101",
      volume: "1",
      change: null,
      high: null,
      low: null,
      timestamp,
      receivedAt: timestamp,
      marketCap: null,
    } as const;
    await saveQuote(q);
    await saveQuote({
      ...q,
      price: "1",
      timestamp: new Date(Date.now() - 600000).toISOString(),
    });
    expect(
      (
        await getDb().query(
          "SELECT data FROM market_quotes WHERE provider='kraken' AND asset='BTC'",
        )
      ).rows[0].data.price,
    ).toBe("100");
  });
  it("values manual holdings with precise decimals and no assumed cost basis", async () => {
    const empty = await portfolioSummary();
    expect(empty.totalValue).toBeNull();
    expect(empty.complete).toBe(false);
    expect(empty.coverage).toBe("no_account_data");
    const c = (
      await getDb().query(
        "INSERT INTO portfolio_connections(kind,label,status) VALUES('manual','Test only','manual') RETURNING id",
      )
    ).rows[0].id;
    await getDb().query(
      "INSERT INTO holdings(connection_id,asset,quantity) VALUES($1,'BTC','0.1')",
      [c],
    );
    const p = await portfolioSummary();
    expect(p.totalValue).toBe("10");
    expect(p.holdings[0].pnl).toBeNull();
  });
  it("never triggers a price zone from stale data", async () => {
    await getDb().query(
      "UPDATE market_quotes SET data=jsonb_set(data,'{timestamp}',to_jsonb('2000-01-01T00:00:00Z'::text))",
    );
    await getDb().query(
      "INSERT INTO alert_rules(asset,timeframe,lower_price,upper_price,provider,currency) VALUES('BTC','4h',90,110,'kraken','USD')",
    );
    await scanMarkets();
    expect(
      (
        await getDb().query(
          "SELECT id FROM alerts WHERE dedup_key LIKE 'zone:%'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("records a zone exit once, resolves the entry, and preserves fresh exit evidence", async () => {
    const timestamp = new Date().toISOString();
    const quote = {
      asset: "BTC",
      provider: "kraken",
      currency: "USD",
      price: "120",
      bid: "119",
      ask: "121",
      volume: "1",
      change: null,
      high: null,
      low: null,
      timestamp,
      receivedAt: timestamp,
      marketCap: null,
    };
    await saveQuote(quote);
    const id = await createAlert(
      "test-zone-exit",
      "BTC",
      "zone_entered",
      "medium",
      { quote, rule: { lower_price: "90", upper_price: "110" } },
      1,
    );
    await processAlerts();
    await processAlerts();
    expect(
      (await getDb().query("SELECT status FROM alerts WHERE id=$1", [id]))
        .rows[0].status,
    ).toBe("resolved");
    const exits = (
      await getDb().query("SELECT evidence FROM alerts WHERE dedup_key=$1", [
        `zone-exit:${id}`,
      ])
    ).rows;
    expect(exits).toHaveLength(1);
    expect(exits[0].evidence.quote.price).toBe("120");
  });
  it("persists news reviews and supplies conflicting evidence without recursive AI prose", async () => {
    const published = new Date().toISOString();
    for (const [id, title] of [
      ["a", "SEC approves Bitcoin spot ETF trading proposal"],
      ["b", "SEC rejects Bitcoin spot ETF trading proposal"],
    ]) {
      await getDb().query(
        "INSERT INTO news_articles(id,canonical_url,source,title,published_at,cluster_id,classification) VALUES($1,$2,'Test feed',$3,$4,$1,$5)",
        [
          id,
          `https://example.org/${id}`,
          title,
          published,
          JSON.stringify(classifyNews(title, false, published)),
        ],
      );
    }
    await getDb().query(
      "INSERT INTO ai_analyses(request_key,kind,context,result) VALUES('test-news','news',$1,$2)",
      [
        JSON.stringify({ newsId: "a" }),
        JSON.stringify({ summary: "Saved test review" }),
      ],
    );
    const rows = await listNews("BTC");
    expect(rows.find((n) => n.id === "a")?.analysis.summary).toBe(
      "Saved test review",
    );
    expect(compactNews(rows)[0]).not.toHaveProperty("analysis");
    const context = await newsContext("a");
    expect(context?.evidenceIds).toEqual(["news:a", "news:b"]);
    expect(context?.coverage[0].relationship).toBe("potential_conflict");
  });
});
