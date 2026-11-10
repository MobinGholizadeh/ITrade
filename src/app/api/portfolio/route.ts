import { z } from "zod";
import { manualHolding } from "@/domain/portfolio";
import { portfolioSummary } from "@/server/portfolio-service";
import { krakenCredentials, verifyKraken } from "@/server/portfolio-providers";
import { encryptSecret } from "@/server/secrets";
import { getDb } from "@/server/db";
import { allowedMutation, json } from "@/server/http";
import { readJsonBody } from "@/server/request-body";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await portfolioSummary());
  } catch {
    return json({ error: "Portfolio unavailable" }, 503);
  }
}
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("manual"), holding: manualHolding }).strict(),
  z
    .object({
      action: z.literal("wallet"),
      kind: z.enum(["ethereum", "base", "arbitrum", "optimism", "solana"]),
      address: z.string().max(64),
      label: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({ action: z.literal("exchange"), credentials: krakenCredentials })
    .strict(),
  z.object({ action: z.literal("disconnect"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("remove_holding"), id: z.uuid() }).strict(),
]);
export async function POST(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  try {
    const m = mutation.parse(await readJsonBody(req));
    if (
      m.action === "wallet" &&
      !(
        m.kind !== "solana"
          ? /^0x[0-9a-fA-F]{40}$/
          : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
      ).test(m.address)
    )
      return json({ error: "Invalid public address" }, 400);
    let sealed = "";
    if (m.action === "exchange") {
      await verifyKraken(m.credentials);
      sealed = encryptSecret(m.credentials);
    }
    const c = await getDb().connect();
    try {
      await c.query("BEGIN");
      if (m.action === "manual") {
        let r = await c.query(
          "SELECT id FROM portfolio_connections WHERE kind='manual' FOR UPDATE",
        );
        if (!r.rows.length)
          r = await c.query(
            "INSERT INTO portfolio_connections(kind,label,status) VALUES('manual','Manual holdings','manual') RETURNING id",
          );
        const h = m.holding;
        await c.query(
          "INSERT INTO holdings(connection_id,asset,quantity,cost_basis,acquired_at,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,asset) DO UPDATE SET quantity=$3,cost_basis=$4,acquired_at=$5,notes=$6,updated_at=now()",
          [
            r.rows[0].id,
            h.asset,
            h.quantity,
            h.costBasis,
            h.acquiredAt,
            h.notes,
          ],
        );
      } else if (m.action === "wallet")
        await c.query(
          "INSERT INTO portfolio_connections(kind,label,address) VALUES($1,$2,$3)",
          [
            m.kind,
            m.label,
            m.kind !== "solana" ? m.address.toLowerCase() : m.address,
          ],
        );
      else if (m.action === "exchange")
        await c.query(
          "INSERT INTO portfolio_connections(kind,label,credentials) VALUES('kraken','Kraken read-only',$1)",
          [sealed],
        );
      else if (m.action === "disconnect")
        await c.query("DELETE FROM portfolio_connections WHERE id=$1", [m.id]);
      else
        await c.query(
          "DELETE FROM holdings WHERE id=$1 AND connection_id IN (SELECT id FROM portfolio_connections WHERE kind='manual')",
          [m.id],
        );
      await c.query(
        "INSERT INTO audit_events(event_type,details) VALUES($1,$2)",
        [`portfolio.${m.action}`, JSON.stringify({ action: m.action })],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    return json({ ok: true });
  } catch {
    return json(
      {
        error:
          "Portfolio update rejected. Check values, duplicate connections, provider keys and read-only permissions.",
      },
      400,
    );
  }
}
