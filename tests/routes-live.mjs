import { request } from "node:http";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3000";
for (const path of [
  "/",
  "/markets",
  "/assets/BTC",
  "/news",
  "/portfolio",
  "/alerts",
  "/analyst",
  "/intelligence",
  "/settings",
  "/money-management",
]) {
  const r = await fetch(origin + path);
  assert.equal(r.status, 200, path);
  assert.match(await r.text(), /ITrade|itrade/);
}
for (const path of [
  "/api/market",
  "/api/news",
  "/api/portfolio",
  "/api/alerts",
  "/api/chat",
  "/api/analysis",
  "/api/intelligence",
  "/api/diagnostics",
]) {
  const r = await fetch(origin + path);
  assert.equal(r.status, 200, path);
  assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  await r.json();
}
for (const path of [
  "/api/portfolio",
  "/api/alerts",
  "/api/chat",
  "/api/analysis",
  "/api/push",
]) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      Origin: "https://attacker.invalid",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403, path);
}
const host = await new Promise((resolve, reject) => {
  const r = request(
    origin + "/api/market",
    { headers: { Host: "untrusted.invalid" } },
    (response) => {
      response.resume();
      resolve(response.statusCode);
    },
  );
  r.on("error", reject);
  r.end();
});
assert.equal(host, 403);
const malformed = await fetch(origin + "/api/market?asset=UNSUPPORTED");
assert.equal(malformed.status, 400);
console.log(
  "10 pages, 8 read APIs, origin protection, host protection and asset validation passed.",
);
