import { it, expect } from "vitest";
import {
  localOrigin,
  passwordHash,
  verifyPassword,
  sessionToken,
  validSession,
} from "../src/server/auth";
it("accepts only loopback origins as local", () => {
  expect(localOrigin("http://127.0.0.1:3000")).toBe(true);
  expect(localOrigin("https://localhost.evil.test")).toBe(false);
});
it("checks passwords with salted scrypt", () => {
  const h = passwordHash("test-password");
  expect(verifyPassword("test-password", h)).toBe(true);
  expect(verifyPassword("wrong", h)).toBe(false);
});
it("rejects forged expired and future sessions", () => {
  const key = "k".repeat(32),
    token = sessionToken(key, 1000);
  expect(validSession(token, key, 2000)).toBe(true);
  expect(validSession(token, "z".repeat(32), 2000)).toBe(false);
  expect(validSession(token, key, 9 * 3600000)).toBe(false);
  expect(validSession(token + ".extra", key, 2000)).toBe(false);
});
