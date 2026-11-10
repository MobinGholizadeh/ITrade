import { intelligenceSummary } from "@/server/intelligence-service";
import { json } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await intelligenceSummary());
  } catch {
    return json({ error: "Intelligence data unavailable" }, 503);
  }
}
