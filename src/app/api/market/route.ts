import { z } from "zod";
import { assetSchema, intervals } from "@/domain/market";
import { marketHistory, marketOverview } from "@/server/market-service";
import { json } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    if (u.searchParams.has("asset")) {
      const asset = assetSchema.parse(u.searchParams.get("asset"));
      const tf = z
        .enum(
          Object.keys(intervals) as [
            keyof typeof intervals,
            ...(keyof typeof intervals)[],
          ],
        )
        .parse(u.searchParams.get("timeframe") ?? "4h");
      return json({
        asset,
        timeframe: tf,
        candles: await marketHistory(asset, tf),
      });
    }
    return json({ quotes: await marketOverview() });
  } catch (e) {
    return json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid asset or timeframe"
            : "Market storage unavailable",
      },
      e instanceof z.ZodError ? 400 : 503,
    );
  }
}
