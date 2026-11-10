import "server-only";
import { getHealth } from "@/server/health";
import { json } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const report = await getHealth();
    return json(report, report.status === "healthy" ? 200 : 503);
  } catch {
    return json({ error: "Server configuration is invalid" }, 503);
  }
}
