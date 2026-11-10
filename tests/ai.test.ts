import { it, expect } from "vitest";
import { validateAnalysis, newsImpactSchema } from "../src/domain/ai";
const timestamp = new Date().toISOString();
const good = {
  asset: "BTC",
  analysisType: "no_opportunity",
  summary: "No confirmation",
  supportingFactors: [],
  negativeFactors: [],
  confirmationConditions: [],
  invalidationConditions: [],
  riskConsiderations: ["Volatility"],
  evidenceIds: ["quote:BTC"],
  dataTimestamp: timestamp,
  action: "watch",
  confidence: "low",
};
it("accepts a grounded no-opportunity result", () =>
  expect(validateAnalysis(good, ["quote:BTC"], timestamp, "BTC").action).toBe(
    "watch",
  ));
it.each([
  { ...good, asset: "DOGE" },
  { ...good, action: "buy" },
  { ...good, execute: "order" },
  { ...good, evidenceIds: ["invented"] },
  { ...good, dataTimestamp: "2020-01-01T00:00:00.000Z" },
  { ...good, analysisType: "buy_watch" },
])("rejects invalid or ungrounded responses", (value) =>
  expect(() =>
    validateAnalysis(value, ["quote:BTC"], timestamp, "BTC"),
  ).toThrow(),
);
it("requires a complete news impact review and does not accept priced-in claims without evidence", () => {
  expect(() =>
    validateAnalysis(good, ["quote:BTC"], timestamp, "BTC", "news"),
  ).toThrow();
  const impact = {
    affectedAssets: ["BTC"],
    sectors: ["ETFs"],
    sentiment: "unrated",
    shortTerm: "Unknown",
    longTerm: "Unknown",
    pricedIn: "unknown",
    whyItMatters: "Review original report",
    unconfirmedClaims: [],
    verificationLimits: "Headline only",
  };
  expect(newsImpactSchema.parse(impact).pricedIn).toBe("unknown");
  expect(() =>
    newsImpactSchema.parse({ ...impact, pricedIn: "yes" }),
  ).toThrow();
});
