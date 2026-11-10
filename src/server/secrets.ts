import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw Error("Credential encryption key must be configured on the server");
  return Buffer.from(value, "hex");
}
export function encryptSecret(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("itrade-credentials-v1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptSecret(value: string): unknown {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1") throw Error("Unknown encryption version");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from("itrade-credentials-v1"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
