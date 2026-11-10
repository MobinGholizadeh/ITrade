import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  analysisSchema,
  analystInstructions,
  validateAnalysis,
  newsImpactSchema,
} from "../domain/ai";
import { getDb } from "./db";
import { readSettings } from "./settings-repository";
import { marketOverview, serviceStatus } from "./market-service";
import { listNews, compactNews } from "./news-service";
import type { Timeframe } from "../domain/market";
import { retryUnavailable } from "./ai-retry";
export type AnalysisContext = {
  asset: string | null;
  dataTimestamp: string;
  evidenceIds: string[];
  [key: string]: unknown;
};
export async function reserveAi(requestKey: string, model: string) {
  const { settings } = await readSettings();
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(731010)");
    const count = await client.query(
      "SELECT count(*)::int n FROM ai_usage WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    );
    if (count.rows[0].n >= settings.dailyAiRequestBudget)
      throw Error("Daily AI request budget reached");
    const r = await client.query(
      "INSERT INTO ai_usage(request_key,model) VALUES($1,$2) RETURNING id",
      [requestKey, model],
    );
    await client.query("COMMIT");
    return r.rows[0].id as string;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function runAnalysis(
  context: AnalysisContext,
  kind: string,
  question = "Explain the supplied evidence",
) {
  const marketEvidence = (
    context.evidence as Record<string, unknown> | undefined
  )?.get_market_overview;
  const selectedAssets = Array.isArray(context.selectedAssets)
    ? context.selectedAssets
    : [];
  if (
    kind === "chat" &&
    Array.isArray(marketEvidence) &&
    (!marketEvidence.some((q) => q && q.fresh === true) ||
      selectedAssets.some(
        (a) => !marketEvidence.some((q) => q?.asset === a && q.fresh === true),
      ))
  ) {
    return {
      ...analysisSchema.parse({
        asset: context.asset,
        analysisType: "insufficient_data",
        summary:
          "Live market evidence is unavailable or stale. I cannot assess a current entry, exit, price direction or opportunity. Historical candles and headlines remain available for review, but they do not establish current market conditions.",
        supportingFactors: [],
        negativeFactors: [
          "No fresh exchange quote is available in the retrieved context.",
        ],
        confirmationConditions: [
          "Wait for a fresh exchange quote and validated, gap-free closed candles.",
        ],
        invalidationConditions: [],
        riskConsiderations: [
          "Acting on stale prices can misstate exposure, stop distance and position size.",
        ],
        evidenceIds: context.evidenceIds.includes("get_market_overview")
          ? ["get_market_overview"]
          : [],
        dataTimestamp: context.dataTimestamp,
        action: "watch",
        confidence: "low",
      }),
      generatedBy: "data_guard",
    };
  }
  if (!process.env.GEMINI_API_KEY) throw Error("Gemini key is not configured");
  const { settings } = await readSettings();
  const model =
    settings.geminiModel || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const input = JSON.stringify({ question, context });
  if (input.length > 48000) throw Error("Context too large");
  const key = createHash("sha256")
    .update("schema-v2:" + model + kind + input)
    .digest("hex");
  const cached = await getDb().query(
    "SELECT result FROM ai_analyses WHERE request_key=$1",
    [key],
  );
  if (cached.rows.length) return cached.rows[0].result;
  // Serialize identical requests across API and worker processes. Locks expire after bounded API timeout.
  const { readyRedis, getRedis } = await import("./redis");
  await readyRedis();
  const lock = `itrade:ai:${key}`;
  const token = crypto.randomUUID();
  if ((await getRedis().set(lock, token, "EX", 150, "NX")) !== "OK")
    throw Error("Identical analysis is already in progress");
  try {
    let usageId = await reserveAi(key, model);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const outputSchema = z.toJSONSchema(
        kind === "news"
          ? analysisSchema.extend({ newsImpact: newsImpactSchema })
          : analysisSchema,
      );
      outputSchema.properties!.asset =
        context.asset === null
          ? { type: "null" }
          : { type: "string", enum: [context.asset] };
      outputSchema.properties!.dataTimestamp = {
        type: "string",
        enum: [context.dataTimestamp],
      };
      outputSchema.properties!.evidenceIds = {
        type: "array",
        items: { type: "string", enum: context.evidenceIds },
        maxItems: 30,
      };
      const response = await retryUnavailable(
        () =>
          ai.interactions.create(
            {
              model,
              input,
              system_instruction: analystInstructions,
              store: false,
              response_format: {
                type: "text",
                mime_type: "application/json",
                schema: outputSchema,
              },
              generation_config: { max_output_tokens: 2500 },
            },
            {
              timeout_ms: Math.min(
                60000,
                Math.max(
                  5000,
                  Number(process.env.GEMINI_REQUEST_TIMEOUT_MS) || 45000,
                ),
              ),
              retries: { strategy: "none" },
            },
          ),
        async () => {
          await getDb().query(
            "UPDATE ai_usage SET status='failed',completed_at=now() WHERE id=$1",
            [usageId],
          );
          usageId = await reserveAi(key, model);
        },
      );
      await getDb().query(
        "UPDATE ai_usage SET input_tokens=$2,output_tokens=$3,status='received',completed_at=now() WHERE id=$1",
        [
          usageId,
          response.usage?.total_input_tokens ?? null,
          response.usage?.total_output_tokens ?? null,
        ],
      );
      if (response.status !== "completed")
        throw Error("Incomplete model response");
      const result = validateAnalysis(
        JSON.parse(response.output_text ?? ""),
        context.evidenceIds,
        context.dataTimestamp,
        context.asset,
        kind,
      );
      if (
        (kind === "market" || kind === "chat" || kind === "holding") &&
        Array.isArray(marketEvidence) &&
        !marketEvidence.some((q) => q?.fresh === true) &&
        result.analysisType !== "insufficient_data"
      )
        throw Error("Stale market interpretation rejected");
      if (
        (kind === "market" || kind === "chat" || kind === "holding") &&
        Date.now() - Date.parse(context.dataTimestamp) > 120000
      )
        throw Error("Analysis evidence expired during generation");
      await getDb().query(
        "INSERT INTO ai_analyses(request_key,asset,kind,context,result,usage_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(request_key) DO NOTHING",
        [
          key,
          context.asset,
          kind,
          JSON.stringify(context),
          JSON.stringify(result),
          usageId,
        ],
      );
      await getDb().query(
        "UPDATE ai_usage SET status='validated' WHERE id=$1",
        [usageId],
      );
      await serviceStatus(
        "gemini",
        "online",
        "Validated structured response received",
      );
      return result;
    } catch (error) {
      await getDb().query(
        "UPDATE ai_usage SET status='failed',completed_at=now() WHERE id=$1",
        [usageId],
      );
      await serviceStatus(
        "gemini",
        "offline",
        error instanceof z.ZodError
          ? `Structured response rejected: ${error.issues
              .map((i) => i.path.join("."))
              .slice(0, 4)
              .join(", ")}`
          : error instanceof Error &&
              [
                "Incomplete model response",
                "Analysis not grounded in supplied evidence",
                "Incomplete conditional watch",
                "Stale market interpretation rejected",
                "Analysis evidence expired during generation",
              ].includes(error.message)
            ? error.message
            : typeof (error as { status?: unknown })?.status === "number"
              ? `Provider request failed (HTTP ${(error as { status: number }).status}); check model access and quota`
              : "Request failed; check connectivity, timeout and provider status",
      );
      throw Error(
        "Gemini request failed or evidence validation rejected the response",
      );
    }
  } finally {
    await getRedis()
      .eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
        1,
        lock,
        token,
      )
      .catch(() => {});
  }
}
export async function analyzeAsset(asset: string, timeframe?: Timeframe) {
  const quotes = await marketOverview();
  const quote = quotes.find((q) => q.asset === asset);
  if (!quote?.fresh) throw Error("Fresh market evidence is required");
  const news = compactNews((await listNews(asset)).slice(0, 6));
  const { assetTechnical } = await import("./technical-service");
  const { settings } = await readSettings();
  const technical = await assetTechnical(
    asset,
    timeframe ?? settings.preferredTimeframe,
  );
  return runAnalysis(
    {
      asset,
      dataTimestamp: quote.timestamp,
      evidenceIds: [
        `quote:${asset}`,
        `technical:${asset}`,
        ...news.map((n) => `news:${n.id}`),
      ],
      quote,
      technical,
      news,
    },
    "market",
  );
}

export async function analyzeHolding(asset: string) {
  const { portfolioSummary } = await import("./portfolio-service");
  const { assetTechnical } = await import("./technical-service");
  const [portfolio, quotes, news, { settings }] = await Promise.all([
    portfolioSummary(),
    marketOverview(),
    listNews(asset),
    readSettings(),
  ]);
  const quote = quotes.find((q) => q.asset === asset);
  const holdings = portfolio.holdings
    .filter((h) => h.asset === asset && Number(h.quantity) > 0)
    .map((h) => ({
      asset: h.asset,
      quantity: h.quantity,
      acquisitionPrice: h.cost_basis,
      price: h.price,
      value: h.value,
      allocation: h.allocation,
      unrealizedPnl: h.pnl,
    }));
  if (!quote?.fresh || !portfolio.balancesFresh || !holdings.length)
    throw Error(
      "A recorded holding and fresh balance/price evidence are required",
    );
  return runAnalysis(
    {
      asset,
      dataTimestamp: quote.timestamp,
      evidenceIds: [
        `quote:${asset}`,
        `holding:${asset}`,
        `technical:${asset}`,
        ...news.slice(0, 4).map((n) => `news:${n.id}`),
      ],
      quote,
      holdings,
      portfolioCoverage: portfolio.coverage,
      portfolioComplete: portfolio.complete,
      technical: await assetTechnical(asset, settings.preferredTimeframe),
      news: compactNews(news.slice(0, 4)),
    },
    "holding",
    "Review this actual holding's exposure, concentration, unrealized P/L only when acquisition price is supplied, technical risks, and recent news. State missing account coverage and cost basis. Explain conditional watch and invalidation points; do not prescribe a purchase or sale.",
  );
}
