import {
  createHmac,
  timingSafeEqual,
  scryptSync,
  randomBytes,
} from "node:crypto";
export function localOrigin(origin: string) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);
}
export function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || !/^[0-9a-f]{64}$/.test(hash)) return false;
  const actual = scryptSync(password, salt, 32);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function sessionToken(secret: string, now = Date.now()) {
  const expires = String(now + 8 * 3600000);
  return `${expires}.${createHmac("sha256", secret).update(expires).digest("hex")}`;
}
export function validSession(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!token || token.split(".").length !== 2 || !secret || secret.length < 32)
    return false;
  const [expires, signature] = token.split(".");
  if (
    !/^\d+$/.test(expires) ||
    Number(expires) <= now ||
    Number(expires) > now + 8 * 3600000 ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha256", secret).update(expires).digest(),
  );
}
