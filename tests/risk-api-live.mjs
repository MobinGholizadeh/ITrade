import assert from "node:assert/strict";
const base = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const initial = await fetch(`${base}/api/risk`);
assert.equal(initial.status, 200);
const original = await initial.json();
assert.ok("profile" in original && Array.isArray(original.plans));
for (const [label, headers, body, expected] of [
  [
    "cross-origin risk write",
    { "Content-Type": "application/json", Origin: "https://untrusted.example" },
    "{}",
    403,
  ],
  [
    "missing acknowledgement",
    { "Content-Type": "application/json", Origin: base },
    JSON.stringify({ action: "profile", profile: {}, revision: 0 }),
    400,
  ],
  [
    "client supplied result rejected",
    { "Content-Type": "application/json", Origin: base },
    JSON.stringify({ action: "plan", result: { quantity: "1000" } }),
    400,
  ],
  [
    "oversized body",
    { "Content-Type": "application/json", Origin: base },
    "x".repeat(18000),
    413,
  ],
  [
    "invalid JSON",
    { "Content-Type": "application/json", Origin: base },
    "{",
    400,
  ],
]) {
  const response = await fetch(`${base}/api/risk`, {
    method: "POST",
    headers,
    body,
  });
  assert.equal(response.status, expected, label);
  console.log(`PASS ${label}`);
}
const after = await (await fetch(`${base}/api/risk`)).json();
assert.equal(after.profile.revision, original.profile.revision);
assert.equal(after.plans.length, original.plans.length);
assert.equal(
  (await fetch(`${base}/api/risk/market?asset=UNKNOWN&timeframe=1h`)).status,
  400,
);
assert.equal(
  (await fetch(`${base}/api/risk/market?asset=BTC&timeframe=4h`)).status,
  400,
);
assert.equal((await fetch(`${base}/money-management`)).status, 200);
console.log(
  "PASS invalid provider queries, route and no mutation from rejected requests",
);
if (process.env.VERIFY_LIVE_MARKET === "1") {
  const response = await fetch(
    `${base}/api/risk/market?asset=BTC&timeframe=1h`,
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.provider, "Coinbase Exchange");
  assert.ok(Number(data.ask) > 0);
  assert.ok(Date.now() - Date.parse(data.eventTime) < 60000);
  assert.ok(data.atr?.candlesUsed >= 15);
  console.log(
    `PASS actual public market connection: ${data.provider}, ${data.asset}/${data.currency}, quote at ${data.eventTime}, ATR ${data.atr.timeframe}`,
  );
}
