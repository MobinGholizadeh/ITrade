import { it, expect } from "vitest";
import { parseFeed, cryptoPanicSchema } from "../src/server/news-providers";
it("normalizes RSS and Atom titles with original links", () => {
  expect(
    parseFeed(
      "<rss><channel><item><title>Bitcoin news</title><link>https://example.org/a</link><pubDate>2026-11-01</pubDate></item></channel></rss>",
      "Feed",
      false,
    ),
  ).toEqual([
    {
      title: "Bitcoin news",
      url: "https://example.org/a",
      published: "2026-11-01",
      source: "Feed",
      official: false,
    },
  ]);
  expect(
    parseFeed(
      '<feed><entry><title>Ethereum news</title><link rel="alternate" href="https://example.org/b"/><updated>2026-11-01</updated></entry></feed>',
      "Official",
      true,
    )[0],
  ).toMatchObject({ url: "https://example.org/b", official: true });
});
it("rejects entities and does not invent missing publication times", () => {
  expect(() => parseFeed("<!DOCTYPE rss><rss/>", "test", false)).toThrow();
  expect(
    parseFeed(
      "<rss><channel><item><title>Unknown</title><link>https://example.org</link></item></channel></rss>",
      "test",
      false,
    )[0].published,
  ).toBeNull();
});
it("validates API metadata without needing article bodies", () => {
  expect(
    cryptoPanicSchema.safeParse({
      results: [
        {
          title: "Bitcoin",
          url: "https://cryptopanic.com/news/1",
          published_at: null,
        },
      ],
    }).success,
  ).toBe(true);
  expect(
    cryptoPanicSchema.safeParse({
      results: [{ title: "Bitcoin", url: "javascript:bad", published_at: 4 }],
    }).success,
  ).toBe(false);
});
