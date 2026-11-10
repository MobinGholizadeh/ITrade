import "server-only";
import { allowedMutation, json } from "@/server/http";
import { BodyError, readJsonBody } from "@/server/request-body";
import {
  readRiskWorkspace,
  mutateRisk,
  riskMutationSchema,
  RiskRuleViolation,
} from "@/server/risk-repository";
import { RevisionConflict } from "@/server/settings-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await readRiskWorkspace());
  } catch {
    return json(
      {
        error:
          "Money Management storage unavailable. Check PostgreSQL and apply migrations.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!allowedMutation(request))
    return json({ error: "Same-origin request required" }, 403);
  try {
    const parsed = riskMutationSchema.safeParse(await readJsonBody(request));
    if (!parsed.success)
      return json(
        {
          error: parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    await mutateRisk(parsed.data);
    return json({ saved: true });
  } catch (error) {
    if (error instanceof BodyError)
      return json({ error: error.message }, error.status);
    if (error instanceof RevisionConflict)
      return json(
        {
          error:
            "This record changed or the plan was already saved. Reload before retrying.",
        },
        409,
      );
    if (error instanceof RiskRuleViolation)
      return json({ error: error.message }, 422);
    return json(
      {
        error:
          "The change could not be saved. Check your inputs and database health.",
      },
      503,
    );
  }
}
