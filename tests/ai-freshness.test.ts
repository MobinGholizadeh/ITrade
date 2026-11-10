import { it, expect } from "vitest";
import { runAnalysis } from "../src/server/ai-service";
it("refuses stale market chat before accessing Gemini, Redis or budgets", async () => {
  const result = await runAnalysis(
    {
      asset: null,
      dataTimestamp: new Date().toISOString(),
      evidenceIds: ["get_market_overview"],
      evidence: { get_market_overview: [{ asset: "BTC", fresh: false }] },
    },
    "chat",
  );
  expect(result.analysisType).toBe("insufficient_data");
});
it("does not let a fresh unrelated asset excuse the requested stale asset", async () => {
  const result = await runAnalysis(
    {
      asset: null,
      selectedAssets: ["BTC"],
      dataTimestamp: new Date().toISOString(),
      evidenceIds: ["get_market_overview"],
      evidence: {
        get_market_overview: [
          { asset: "BTC", fresh: false },
          { asset: "ETH", fresh: true },
        ],
      },
    },
    "chat",
  );
  expect(result.analysisType).toBe("insufficient_data");
});
