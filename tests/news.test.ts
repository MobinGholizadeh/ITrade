import { it, expect } from "vitest";
import {
  canonicalUrl,
  classifyNews,
  storyCluster,
  sameHeadlineEvent,
  relatedCoverage,
} from "../src/domain/news";
it("canonicalizes tracking links", () =>
  expect(canonicalUrl("https://example.com/story?utm_source=x#top")).toBe(
    "https://example.com/story",
  ));
it("rejects non-web links", () =>
  expect(() => canonicalUrl("javascript:alert(1)")).toThrow());
it("groups conservative syndicated wording but preserves contradictions and amounts", () => {
  expect(
    sameHeadlineEvent(
      "SEC approves Bitcoin spot ETF trading proposal",
      "SEC approves the Bitcoin spot ETF trading proposal",
    ),
  ).toBe(true);
  expect(
    sameHeadlineEvent(
      "SEC approves Bitcoin spot ETF trading proposal",
      "SEC rejects Bitcoin spot ETF trading proposal",
    ),
  ).toBe(false);
  expect(
    sameHeadlineEvent(
      "Bitcoin ETF receives 100 million dollars inflows",
      "Bitcoin ETF receives 200 million dollars inflows",
    ),
  ).toBe(false);
  expect(
    sameHeadlineEvent(
      "Bitcoin ETF trading approval confirmed today",
      "Bitcoin ETF trading approval not confirmed today",
    ),
  ).toBe(false);
});
it("does not map ambiguous SOL LINK ADA words", () =>
  expect(classifyNews("A link to ADA compliance", false, null).assets).toEqual(
    [],
  ));
it("never confirms a rumor even from an official feed", () =>
  expect(
    classifyNews("Unconfirmed Bitcoin exploit", true, new Date().toISOString())
      .verification,
  ).toBe("unconfirmed"));
it("downranks missing or old timestamps", () =>
  expect(classifyNews("Bitcoin hack", false, null).priority).toBe("low"));
it("labels conflicting report", () =>
  expect(
    classifyNews("Exchange denies Bitcoin hack", false, null).verification,
  ).toBe("disputed"));
it("clusters identical syndication titles", () =>
  expect(storyCluster("Bitcoin: New ETF!")).toBe(
    storyCluster("bitcoin new etf"),
  ));
it("keeps recurring official announcements on different dates distinct", () => {
  expect(
    storyCluster(
      "Federal Reserve issues FOMC statement",
      "2026-10-01T00:00:00Z",
    ),
  ).not.toBe(
    storyCluster(
      "Federal Reserve issues FOMC statement",
      "2026-11-01T00:00:00Z",
    ),
  );
});
it("caps unconfirmed breaking stories and weights primary-source reliability", () => {
  const now = new Date().toISOString();
  expect(classifyNews("Unconfirmed Bitcoin exploit", false, now).priority).toBe(
    "medium",
  );
  expect(classifyNews("Bitcoin exploit", true, now).score).toBeGreaterThan(
    classifyNews("Bitcoin exploit", false, now).score,
  );
});
it("flags possible contradictory coverage without claiming independent confirmation", () => {
  const published = new Date().toISOString();
  const row = (id: string, title: string) => ({
    id,
    title,
    source: id,
    canonical_url: `https://${id}.example/story`,
    published_at: published,
    cluster_id: id,
    classification: classifyNews(title, false, published),
  });
  const a = row("a", "SEC approves Bitcoin spot ETF trading proposal");
  const b = row("b", "SEC rejects Bitcoin spot ETF trading proposal");
  expect(relatedCoverage(a, [a, b])[0]).toMatchObject({
    relationship: "potential_conflict",
    independence:
      "Not established; publishers may repeat the same original report",
  });
  expect(relatedCoverage(a, [{ ...b, published_at: null }])).toEqual([]);
  expect(relatedCoverage(a, [{ ...b, published_at: "2020-01-01" }])).toEqual(
    [],
  );
});
