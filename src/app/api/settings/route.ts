import "server-only";
import { settingsWriteSchema } from "@/domain/settings";
import {
  readSettings,
  saveSettings,
  RevisionConflict,
} from "@/server/settings-repository";
import { allowedMutation, json } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await readSettings());
  } catch {
    return json(
      {
        error:
          "Settings unavailable. Start PostgreSQL and run the database migration.",
      },
      503,
    );
  }
}
export async function PUT(request: Request) {
  if (!allowedMutation(request))
    return json({ error: "Same-origin request required" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON required" }, 415);
  // Bounded streaming read also covers requests without a Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Missing request body" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return json({ error: "Request too large" }, 413);
      }
      chunks.push(value);
    }
    const result = settingsWriteSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (!result.success)
      return json(
        {
          error: "Invalid settings",
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    try {
      return json(
        await saveSettings(result.data.settings, result.data.revision),
      );
    } catch (error) {
      if (error instanceof RevisionConflict)
        return json(
          {
            error: "Settings changed in another session. Reload before saving.",
          },
          409,
        );
      return json(
        { error: "Settings could not be saved. Check database health." },
        503,
      );
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  } finally {
    reader.releaseLock();
  }
}
