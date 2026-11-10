import { it, expect } from "vitest";
import {
  sentimentSchema,
  capitalizationSchema,
} from "../src/server/market-context";
it("rejects out-of-scale, future and provider-error sentiment", () => {
  const valid = {
    data: [
      {
        value: "35",
        value_classification: "Fear",
        timestamp: String(Math.floor(Date.now() / 1000)),
      },
    ],
    metadata: { error: null },
  };
  expect(sentimentSchema.parse(valid).data[0].value).toBe(35);
  expect(
    sentimentSchema.safeParse({ ...valid, metadata: { error: "unavailable" } })
      .success,
  ).toBe(false);
  expect(
    sentimentSchema.safeParse({
      ...valid,
      data: [{ ...valid.data[0], value: "101" }],
    }).success,
  ).toBe(false);
  expect(
    sentimentSchema.safeParse({
      ...valid,
      data: [{ ...valid.data[0], timestamp: String(Date.now()) }],
    }).success,
  ).toBe(false);
});
it("keeps missing capitalization null and rejects ambiguous asset IDs", () => {
  expect(
    capitalizationSchema.parse([
      {
        id: "bitcoin",
        market_cap: null,
        last_updated: new Date().toISOString(),
      },
    ])[0].market_cap,
  ).toBeNull();
  expect(
    capitalizationSchema.safeParse([
      { id: "BTC", market_cap: 100, last_updated: new Date().toISOString() },
    ]).success,
  ).toBe(false);
});
