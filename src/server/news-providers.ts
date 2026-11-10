import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { providerJson } from "./provider-http";
export const newsFeeds = [
  {
    name: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    official: true,
  },
  {
    name: "SEC",
    url: "https://www.sec.gov/news/pressreleases.rss",
    official: true,
  },
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    official: false,
  },
  {
    name: "Ethereum Foundation",
    url: "https://blog.ethereum.org/en/feed.xml",
    official: true,
  },
  { name: "Kraken Blog", url: "https://blog.kraken.com/feed", official: true },
];
export type Headline = {
  title: string;
  url: string;
  published: string | null;
  source: string;
  official: boolean;
};
export function parseFeed(
  xml: string,
  source: string,
  official: boolean,
): Headline[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error("Unsafe XML");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(xml);
  const items = parsed.rss?.channel?.item ?? parsed.feed?.entry;
  if (!items) throw Error("Unsupported feed");
  return (Array.isArray(items) ? items : [items])
    .slice(0, 60)
    .flatMap((item) => {
      const title =
        typeof item.title === "string" ? item.title : item.title?.["#text"];
      const links = Array.isArray(item.link) ? item.link : [item.link];
      const url =
        typeof item.link === "string"
          ? item.link
          : links.find(
              (l: Record<string, string> | undefined) =>
                l?.["@_rel"] === "alternate" || !l?.["@_rel"],
            )?.["@_href"];
      if (typeof title !== "string" || typeof url !== "string") return [];
      return [
        {
          title: title.replace(/<[^>]*>/g, "").slice(0, 500),
          url,
          published: item.pubDate ?? item.published ?? item.updated ?? null,
          source,
          official,
        },
      ];
    });
}
export const cryptoPanicSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().max(500),
        published_at: z.string().nullable(),
        original_url: z.url().optional().nullable(),
        url: z.url(),
        source: z.object({ title: z.string().max(120) }).optional(),
      }),
    )
    .max(100),
});
export async function cryptoPanicHeadlines(): Promise<Headline[]> {
  const plan = z
    .enum(["developer", "growth", "enterprise"])
    .parse(process.env.CRYPTOPANIC_PLAN ?? "developer");
  if (!process.env.CRYPTOPANIC_API_KEY) return [];
  const data = cryptoPanicSchema.parse(
    await providerJson(
      `https://cryptopanic.com/api/${plan}/v2/posts/?auth_token=${encodeURIComponent(process.env.CRYPTOPANIC_API_KEY)}&kind=news&public=true`,
    ),
  );
  return data.results.map((r) => ({
    title: r.title,
    url: r.original_url ?? r.url,
    published: r.published_at,
    source: `CryptoPanic / ${r.source?.title ?? "aggregated news"}`,
    official: false,
  }));
}
