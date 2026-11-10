import "server-only";
import { marketRequestSchema } from "@/domain/risk-market";
import { getRiskSnapshot } from "@/server/risk-market";
import { json } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = marketRequestSchema.safeParse({
    asset: url.searchParams.get("asset"),
    timeframe: url.searchParams.get("timeframe"),
  });
  if (!parsed.success)
    return json(
      { error: "Choose a supported asset and 1h or 1d timeframe." },
      400,
    );
  try {
    return json(await getRiskSnapshot(parsed.data));
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Public reference unavailable",
      },
      503,
    );
  }
}
