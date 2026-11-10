import assert from "node:assert/strict";

// Exercises the running local Next.js API; rejected writes do not modify settings.
const base = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const get = await fetch(`${base}/api/settings`);
assert.equal(get.status, 200);
assert.equal(get.headers.get("cache-control"), "no-store");
const record = await get.json();
const headers = { "Content-Type": "application/json", Origin: base };
for (const [label, body, customHeaders, expected] of [
  [
    "foreign origin",
    JSON.stringify(record),
    { ...headers, Origin: "https://untrusted.example" },
    403,
  ],
  ["missing origin", "{}", { "Content-Type": "application/json" }, 403],
  ["malformed JSON", "{", headers, 400],
  [
    "invalid budget",
    JSON.stringify({
      settings: { ...record.settings, dailyAiRequestBudget: -1 },
      revision: record.revision,
    }),
    headers,
    400,
  ],
  [
    "secret field",
    JSON.stringify({
      settings: { ...record.settings, apiKey: "test-secret" },
      revision: record.revision,
    }),
    headers,
    400,
  ],
  ["oversized payload", "x".repeat(9000), headers, 413],
  [
    "wrong content type",
    "{}",
    { ...headers, "Content-Type": "text/plain" },
    415,
  ],
]) {
  const response = await fetch(`${base}/api/settings`, {
    method: "PUT",
    headers: customHeaders,
    body,
  });
  assert.equal(response.status, expected, label);
  assert.ok(
    !(await response.text()).includes("test-secret"),
    "Never echo submitted secret values",
  );
  console.log(`PASS ${label}: ${expected}`);
}
const after = await (await fetch(`${base}/api/settings`)).json();
assert.equal(
  after.revision,
  record.revision,
  "Rejected writes must not change revision",
);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
try {
  const response = await fetch(`${base}/api/events`, {
    signal: controller.signal,
  });
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    healthEvent;
  while (!healthEvent) {
    const { value, done } = await reader.read();
    assert.equal(done, false, "Stream ended before health event");
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop();
    healthEvent = events.find((event) => event.startsWith("event: health\n"));
  }
  const report = JSON.parse(healthEvent.split("data: ")[1].trim());
  assert.equal(report.milestone, "M10 implementation");
  assert.ok(report.checks.some((check) => check.id === "worker"));
  await reader.cancel();
  console.log("PASS SSE health event and client disconnect");
} finally {
  clearTimeout(timeout);
  controller.abort();
}
for (const path of [
  "/",
  "/settings",
  "/markets",
  "/news",
  "/portfolio",
  "/alerts",
  "/analyst",
  "/assets/BTC",
]) {
  assert.equal((await fetch(`${base}${path}`)).status, 200, path);
}
assert.equal((await fetch(`${base}/unknown-page`)).status, 404);
assert.equal((await fetch(`${base}/assets/UNKNOWN`)).status, 404);
console.log("PASS all application routes and unknown-page handling");
