import { getDb } from "@/server/db";
import { json } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json({
      services: (
        await getDb().query(
          "SELECT name,state,detail,checked_at,success_at FROM service_status ORDER BY name",
        )
      ).rows,
      aiUsage: (
        await getDb().query(
          "SELECT status,count(*)::int requests,coalesce(sum(input_tokens),0)::int input_tokens,coalesce(sum(output_tokens),0)::int output_tokens FROM ai_usage WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' GROUP BY status",
        )
      ).rows,
      model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
      configured: {
        gemini: !!process.env.GEMINI_API_KEY,
        alchemy: !!process.env.ALCHEMY_API_KEY,
        helius: !!process.env.HELIUS_API_KEY,
        push: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_SUBJECT,
        flows:
          !!process.env.ETF_FLOW_FEED_URL &&
          process.env.ETF_FLOW_LICENSE_CONFIRMED === "true",
        macro: !!process.env.FMP_API_KEY,
        marketMetadata: !!process.env.COINGECKO_DEMO_API_KEY,
        cryptoPanic: !!process.env.CRYPTOPANIC_API_KEY,
      },
    });
  } catch {
    return json({ error: "Diagnostics unavailable" }, 503);
  }
}
