import { z } from "zod";
import { assetSchema } from "@/domain/market";
import { timeframes } from "@/domain/settings";
import { alertStatuses } from "@/domain/alerts";
import { transitionAlert } from "@/server/alert-service";
import { getDb } from "@/server/db";
import { allowedMutation, json } from "@/server/http";
import { readJsonBody } from "@/server/request-body";
import { readSettings } from "@/server/settings-repository";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { settings } = await readSettings();
    return json({
      currency: settings.marketProvider === "binance" ? "USDT" : "USD",
      provider: settings.marketProvider,
      alerts: (
        await getDb().query(
          "SELECT * FROM alerts ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
      rules: (
        await getDb().query(
          "SELECT * FROM alert_rules ORDER BY created_at DESC",
        )
      ).rows,
      events: (
        await getDb().query(
          "SELECT * FROM alert_events ORDER BY created_at DESC LIMIT 300",
        )
      ).rows,
    });
  } catch {
    return json({ error: "Alert storage unavailable" }, 503);
  }
}
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("status"),
      id: z.uuid(),
      status: z.enum(alertStatuses),
    })
    .strict(),
  z
    .object({
      action: z.literal("rule"),
      asset: assetSchema,
      timeframe: z.enum(timeframes),
      lower: z.number().positive(),
      upper: z.number().positive(),
    })
    .strict()
    .refine((v) => v.upper >= v.lower),
  z.object({ action: z.literal("disable_rule"), id: z.uuid() }).strict(),
]);
export async function POST(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  try {
    const m = input.parse(await readJsonBody(req));
    if (m.action === "status") await transitionAlert(m.id, m.status);
    else if (m.action === "disable_rule")
      await getDb().query("UPDATE alert_rules SET enabled=false WHERE id=$1", [
        m.id,
      ]);
    else {
      const { settings } = await readSettings();
      await getDb().query(
        "INSERT INTO alert_rules(asset,timeframe,lower_price,upper_price,provider,currency) VALUES($1,$2,$3,$4,$5,$6)",
        [
          m.asset,
          m.timeframe,
          m.lower,
          m.upper,
          settings.marketProvider,
          settings.marketProvider === "binance" ? "USDT" : "USD",
        ],
      );
    }
    return json({ ok: true });
  } catch {
    return json({ error: "Invalid alert update" }, 400);
  }
}
