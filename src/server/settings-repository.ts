import {
  settingsSchema,
  type Settings,
  type SettingsRecord,
} from "../domain/settings";
import { getDb } from "./db";

export class RevisionConflict extends Error {}
export async function readSettings(): Promise<SettingsRecord> {
  const result = await getDb().query(
    "SELECT configuration, revision, updated_at FROM user_settings WHERE id = 1",
  );
  if (!result.rows.length)
    throw new Error("Settings missing; run database migration");
  const row = result.rows[0];
  return {
    settings: settingsSchema.parse(row.configuration),
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
  };
}
export async function saveSettings(
  input: Settings,
  revision: number,
): Promise<SettingsRecord> {
  const settings = settingsSchema.parse(input);
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE user_settings SET configuration = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1 AND revision = $2 RETURNING revision, updated_at",
      [JSON.stringify(settings), revision],
    );
    if (!result.rows.length)
      throw new RevisionConflict("Settings were changed in another session");
    await client.query(
      "INSERT INTO audit_events (event_type, details) VALUES ($1, $2::jsonb)",
      [
        "settings.updated",
        JSON.stringify({
          revision: result.rows[0].revision,
          fields: Object.keys(settings),
        }),
      ],
    );
    await client.query("COMMIT");
    return {
      settings,
      revision: result.rows[0].revision,
      updatedAt: result.rows[0].updated_at.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
