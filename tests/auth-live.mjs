import "dotenv/config";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import assert from "node:assert/strict";
const password = randomBytes(24).toString("hex"),
  salt = randomBytes(16).toString("hex");
const origin = "http://127.0.0.1:3101";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3101"],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      APP_ORIGIN: origin,
      REQUIRE_AUTH: "true",
      SESSION_SECRET: randomBytes(32).toString("hex"),
      LOGIN_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 32).toString("hex")}`,
      REDIS_URL: "redis://127.0.0.1:63799/15",
    },
  },
);
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(origin + "/login");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Isolated production web process must start");
  assert.equal((await fetch(origin + "/api/settings")).status, 401);
  const login = (body) =>
    fetch(origin + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await login({ password: "wrong" })).status, 401);
  const accepted = await login({ password });
  assert.equal(accepted.status, 200);
  const cookie = accepted.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=strict/i);
  assert.equal(
    (
      await fetch(origin + "/api/settings", {
        headers: { Cookie: cookie.split(";")[0] },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(origin + "/api/settings", {
        method: "PUT",
        headers: {
          Origin: "https://untrusted.invalid",
          Cookie: cookie.split(";")[0],
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const logout = await fetch(origin + "/api/login", {
    method: "DELETE",
    headers: { Origin: origin, Cookie: cookie.split(";")[0] },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /itrade_session=;/i);
  assert.ok(
    new Date(
      logout.headers.get("set-cookie").match(/Expires=([^;]+)/i)[1],
    ).getTime() < Date.now(),
  );
  console.log(
    "Isolated production login, unauthorized API, session cookie, authenticated read, CSRF and logout passed.",
  );
} finally {
  child.kill();
}
