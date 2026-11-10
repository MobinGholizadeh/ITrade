import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3000";
const paths = [
  "/api/market",
  "/api/news",
  "/api/portfolio",
  "/api/scanner",
  "/api/intelligence",
  "/api/health",
];
for (const path of paths) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200, path);
  await r.arrayBuffer();
}
const times = [],
  errors = [];
const started = Date.now();
await Promise.all(
  Array.from({ length: 4 }, async (_, client) => {
    for (let i = 0; i < 30; i++) {
      const path = paths[(i + client) % paths.length],
        start = performance.now();
      try {
        const r = await fetch(base + path, {
          signal: AbortSignal.timeout(15000),
        });
        assert.equal(r.status, 200, path);
        await r.json();
      } catch {
        errors.push(path);
      }
      times.push(performance.now() - start);
    }
  }),
);
times.sort((a, b) => a - b);
const report = {
  at: new Date().toISOString(),
  mode: "local development; bounded read-only smoke load, not capacity certification",
  requests: times.length,
  concurrency: 4,
  elapsedMs: Date.now() - started,
  errors: errors.length,
  p50Ms: Math.round(times[Math.floor(times.length * 0.5)]),
  p95Ms: Math.round(times[Math.floor(times.length * 0.95)]),
  maxMs: Math.round(times.at(-1)),
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/load-check.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
assert.equal(errors.length, 0, "Concurrent API requests failed");
