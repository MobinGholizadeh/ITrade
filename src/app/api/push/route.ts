import { z } from "zod";
import { getDb } from "@/server/db";
import { encryptSecret } from "@/server/secrets";
import { allowedMutation, json } from "@/server/http";
import { readJsonBody } from "@/server/request-body";
const subscription = z
  .object({
    endpoint: z.url().max(2000),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().min(40).max(200),
        auth: z.string().min(10).max(100),
      })
      .strict(),
  })
  .strict();
export async function GET() {
  return json({
    publicKey:
      process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
        ? (process.env.VAPID_PUBLIC_KEY ?? null)
        : null,
  });
}
export async function POST(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  try {
    const s = subscription.parse(await readJsonBody(req));
    const u = new URL(s.endpoint);
    if (
      u.protocol !== "https:" ||
      u.port ||
      u.username ||
      u.password ||
      ![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ].some((h) => u.hostname === h || u.hostname.endsWith("." + h))
    )
      throw Error("Unsupported push service");
    await getDb().query(
      "INSERT INTO push_subscriptions(endpoint,data) VALUES($1,$2) ON CONFLICT(endpoint) DO UPDATE SET data=$2",
      [s.endpoint, encryptSecret(s)],
    );
    return json({ ok: true });
  } catch {
    return json({ error: "Push subscription rejected" }, 400);
  }
}
