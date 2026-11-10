import { z } from "zod";
import { assetSchema } from "@/domain/market";
import { analyzeAsset, analyzeHolding, runAnalysis } from "@/server/ai-service";
import { readJsonBody } from "@/server/request-body";
import { allowedMutation, json } from "@/server/http";
import { getDb } from "@/server/db";
import { timeframes } from "@/domain/settings";
import { newsContext } from "@/server/news-service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json({
      analyses: (
        await getDb().query(
          "SELECT id,asset,kind,result,created_at FROM ai_analyses ORDER BY created_at DESC LIMIT 30",
        )
      ).rows,
      usage: (
        await getDb().query(
          "SELECT status,count(*)::int requests, sum(input_tokens)::int input_tokens,sum(output_tokens)::int output_tokens FROM ai_usage WHERE created_at>=CURRENT_DATE GROUP BY status",
        )
      ).rows,
    });
  } catch {
    return json({ error: "Analysis storage unavailable" }, 503);
  }
}
export async function POST(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  try {
    const input = z
      .union([
        z
          .object({
            asset: assetSchema,
            timeframe: z.enum(timeframes).optional(),
          })
          .strict(),
        z.object({ newsId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
        z.object({ holdingAsset: assetSchema }).strict(),
      ])
      .parse(await readJsonBody(req));
    if ("holdingAsset" in input)
      return json({ analysis: await analyzeHolding(input.holdingAsset) });
    if ("newsId" in input) {
      const context = await newsContext(input.newsId);
      if (!context) return json({ error: "Article unavailable" }, 404);
      return json({
        analysis: await runAnalysis(
          context,
          "news",
          "Explain possible asset and sector impacts, short- and long-term implications, why it matters, unconfirmed claims, and what to monitor. Include newsImpact. Assess potential conflicts in the supplied related coverage without treating separate publishers as independent confirmation. pricedIn must be unknown. Sentiment is a conditional interpretation of headline implications; use unrated when evidence is insufficient. Do not claim the headline proves a market move.",
        ),
      });
    }
    return json({ analysis: await analyzeAsset(input.asset, input.timeframe) });
  } catch (e) {
    return json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid request"
            : e instanceof Error
              ? e.message
              : "Analysis unavailable",
      },
      400,
    );
  }
}
