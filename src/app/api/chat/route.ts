import { z } from "zod";
import { getDb } from "@/server/db";
import { answerChat } from "@/server/chat-service";
import { allowedMutation, json } from "@/server/http";
import { readJsonBody } from "@/server/request-body";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      z.uuid().parse(id);
      return json({
        messages: (
          await getDb().query(
            "SELECT role,content,created_at FROM conversation_messages WHERE conversation_id=$1 ORDER BY id LIMIT 200",
            [id],
          )
        ).rows,
      });
    }
    return json({
      conversations: (
        await getDb().query(
          "SELECT * FROM conversations ORDER BY created_at DESC LIMIT 50",
        )
      ).rows,
    });
  } catch {
    return json({ error: "Chat history unavailable" }, 400);
  }
}
export async function POST(req: Request) {
  if (!allowedMutation(req)) return json({ error: "Origin rejected" }, 403);
  try {
    const m = z
      .object({
        conversationId: z.uuid().nullable(),
        message: z.string().trim().min(1).max(3000),
      })
      .strict()
      .parse(await readJsonBody(req));
    return json(await answerChat(m.conversationId, m.message));
  } catch {
    return json({ error: "Could not prepare analyst context" }, 400);
  }
}
