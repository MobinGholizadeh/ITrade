import { getDb } from "./db";
import { readAnalystTool } from "./analyst-tools";
import { runAnalysis } from "./ai-service";
import { readSettings } from "./settings-repository";
export async function answerChat(
  conversationId: string | null,
  message: string,
) {
  const title = message.slice(0, 80);
  if (conversationId) {
    const exists = await getDb().query(
      "SELECT id FROM conversations WHERE id=$1",
      [conversationId],
    );
    if (!exists.rows.length) throw Error("Conversation unavailable");
  } else
    conversationId = (
      await getDb().query(
        "INSERT INTO conversations(title) VALUES($1) RETURNING id",
        [title],
      )
    ).rows[0].id;
  const previous = (
    await getDb().query(
      "SELECT role,content FROM conversation_messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 6",
      [conversationId],
    )
  ).rows.reverse();
  await getDb().query(
    "INSERT INTO conversation_messages(conversation_id,role,content) VALUES($1,'user',$2)",
    [conversationId, JSON.stringify({ text: message })],
  );
  const { settings } = await readSettings();
  const mentioned = settings.trackedAssets.filter((a) =>
    new RegExp(`\\b${a}\\b`, "i").test(message),
  );
  const selected = mentioned.length
    ? mentioned.slice(0, 2)
    : settings.trackedAssets.slice(0, 2);
  const evidence: Record<string, unknown> = {};
  for (const name of [
    "get_market_overview",
    "get_portfolio_summary",
    "get_active_alerts",
    "search_news",
    "get_institutional_flows",
  ] as const)
    evidence[name] = await readAnalystTool(name);
  for (const asset of selected)
    evidence[`technical:${asset}`] = await readAnalystTool(
      "get_asset_indicators",
      { asset, timeframe: settings.preferredTimeframe },
    );
  const risk =
    (await getDb().query("SELECT configuration FROM risk_profiles WHERE id=1"))
      .rows[0]?.configuration ?? null;
  evidence.risk_policy = risk?.policy ?? null;
  // Context is bounded; truncation preserves complete source records instead of slicing JSON.
  const history = previous.map((m) => ({
    role: m.role,
    text: String(m.content.text ?? m.content.summary ?? "").slice(0, 2000),
  }));
  try {
    const result = await runAnalysis(
      {
        asset: null,
        dataTimestamp: new Date().toISOString(),
        evidenceIds: Object.keys(evidence),
        evidence,
        selectedAssets: selected,
        history,
      },
      "chat",
      message,
    );
    await getDb().query(
      "INSERT INTO conversation_messages(conversation_id,role,content) VALUES($1,'assistant',$2)",
      [conversationId, JSON.stringify(result)],
    );
    return { conversationId, result };
  } catch {
    await getDb().query(
      "INSERT INTO conversation_messages(conversation_id,role,content) VALUES($1,'assistant',$2)",
      [
        conversationId,
        JSON.stringify({
          text: "Analysis unavailable: Gemini quota, connection, or evidence validation failed. No recommendation was generated.",
        }),
      ],
    );
    return {
      conversationId,
      error: "Analysis unavailable. Check Gemini health and budget.",
    };
  }
}
