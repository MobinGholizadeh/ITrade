import { z } from "zod";
import {
  calculateRisk,
  planInputSchema,
  riskProfileSchema,
  type RiskPlan,
  type RiskProfileRecord,
} from "../domain/risk";
import { getDb } from "./db";
import { RevisionConflict } from "./settings-repository";

const revision = z.number().int().nonnegative();
export const riskMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("profile"),
      profile: riskProfileSchema,
      revision,
      reconciled: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("plan"),
      input: planInputSchema,
      profileRevision: revision,
      id: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("outcome"),
      id: z.uuid(),
      revision,
      netPnl: z.string().regex(/^-?(0|[1-9]\d{0,14})(\.\d{1,18})?$/),
      notes: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export class RiskRuleViolation extends Error {}
export async function readRiskWorkspace(): Promise<{
  profile: RiskProfileRecord;
  plans: RiskPlan[];
}> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const profile = (
      await client.query(
        "SELECT configuration, revision, updated_at FROM risk_profiles WHERE id = 1",
      )
    ).rows[0];
    if (!profile) throw new Error("Risk profile schema missing");
    const rows = (
      await client.query(
        "SELECT id,input,calculation,profile_snapshot,created_at,revision,outcome FROM risk_plans ORDER BY created_at DESC LIMIT 200",
      )
    ).rows;
    await client.query("COMMIT");
    return {
      profile: {
        profile: profile.configuration
          ? riskProfileSchema.parse(profile.configuration)
          : null,
        revision: profile.revision,
        updatedAt: profile.updated_at.toISOString(),
      },
      plans: rows.map((row) => ({
        id: row.id,
        input: row.input,
        result: row.calculation,
        profile: row.profile_snapshot,
        createdAt: row.created_at.toISOString(),
        revision: row.revision,
        outcome: row.outcome,
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function mutateRisk(input: z.infer<typeof riskMutationSchema>) {
  const action = riskMutationSchema.parse(input),
    client = await getDb().connect();
  try {
    await client.query("BEGIN");
    if (action.action === "profile") {
      // Acknowledgement asserts the manual balances are reconciled now, not inferred from a saved plan.
      const profile = {
        ...action.profile,
        account: { ...action.profile.account, asOf: new Date().toISOString() },
      };
      const updated = await client.query(
        "UPDATE risk_profiles SET configuration=$1::jsonb, revision=revision+1, updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision",
        [JSON.stringify(profile), action.revision],
      );
      if (!updated.rows.length) throw new RevisionConflict();
    } else if (action.action === "plan") {
      const profileRow = (
        await client.query(
          "SELECT configuration,revision FROM risk_profiles WHERE id=1 FOR UPDATE",
        )
      ).rows[0];
      if (!profileRow?.configuration)
        throw new RiskRuleViolation(
          "Save a reconciled account snapshot first.",
        );
      if (profileRow.revision !== action.profileRevision)
        throw new RevisionConflict();
      const profile = riskProfileSchema.parse(profileRow.configuration);
      let result;
      try {
        result = calculateRisk(profile, action.input);
      } catch (error) {
        throw new RiskRuleViolation(
          error instanceof Error ? error.message : "Invalid risk plan",
        );
      }
      if (!result.eligible)
        throw new RiskRuleViolation(result.blocks.join(" "));
      const inserted = await client.query(
        "INSERT INTO risk_plans (id,profile_id,input,calculation,profile_snapshot) VALUES ($1,1,$2::jsonb,$3::jsonb,$4::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id",
        [
          action.id,
          JSON.stringify(action.input),
          JSON.stringify(result),
          JSON.stringify(profile),
        ],
      );
      if (!inserted.rows.length)
        throw new RevisionConflict("Plan already saved; reload the journal.");
    } else {
      const outcome = {
        netPnl: action.netPnl,
        notes: action.notes,
        recordedAt: new Date().toISOString(),
      };
      const updated = await client.query(
        "UPDATE risk_plans SET outcome=$1::jsonb, revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING id",
        [JSON.stringify(outcome), action.id, action.revision],
      );
      if (!updated.rows.length) throw new RevisionConflict();
    }
    await client.query(
      "INSERT INTO audit_events (event_type,details) VALUES ($1,$2::jsonb)",
      [
        `risk.${action.action}`,
        JSON.stringify({
          id: "id" in action ? action.id : "profile",
          calculatorVersion: "1",
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
