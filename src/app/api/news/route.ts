import { listNews } from "@/server/news-service";
import { json } from "@/server/http";
import { assetSchema } from "@/domain/market";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const asset = new URL(req.url).searchParams.get("asset");
  if (asset && !assetSchema.safeParse(asset).success)
    return json({ error: "Invalid asset" }, 400);
  try {
    return json({ articles: await listNews(asset ?? undefined) });
  } catch {
    return json({ error: "News storage unavailable" }, 503);
  }
}
