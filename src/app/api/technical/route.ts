import { z } from "zod";
import { assetSchema, intervals } from "@/domain/market";
import { assetTechnical } from "@/server/technical-service";
import { json } from "@/server/http";
export async function GET(req: Request) {
  try {
    const u = new URL(req.url),
      asset = assetSchema.parse(u.searchParams.get("asset")),
      tf = z
        .enum(
          Object.keys(intervals) as [
            keyof typeof intervals,
            ...(keyof typeof intervals)[],
          ],
        )
        .parse(u.searchParams.get("timeframe") ?? "4h");
    return json(await assetTechnical(asset, tf));
  } catch {
    return json({ error: "Technical evidence unavailable" }, 400);
  }
}
