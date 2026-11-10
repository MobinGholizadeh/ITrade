import { createHash } from "node:crypto";
export function canonicalUrl(input: string) {
  const url = new URL(input);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("Invalid article URL");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith("utm_") || ["ref", "fbclid", "gclid"].includes(key))
      url.searchParams.delete(key);
  return url.toString();
}
export function classifyNews(
  title: string,
  official: boolean,
  published: string | null,
  now = Date.now(),
) {
  const text = title.toLowerCase(),
    assets: string[] = [];
  for (const [asset, pattern] of Object.entries({
    BTC: /\b(bitcoin|btc)\b/,
    ETH: /\b(ethereum|ether|eth)\b/,
    SOL: /\bsolana\b/,
    ADA: /\bcardano\b/,
    AVAX: /\bavalanche\b/,
    LINK: /\bchainlink\b/,
  }))
    if (pattern.test(text)) assets.push(asset);
  const category = /hack|exploit|breach/.test(text)
    ? "security"
    : /etf|exchange.traded/.test(text)
      ? "etf"
      : /interest rate|federal reserve|inflation|fomc/.test(text)
        ? "macro"
        : /sec\b|regulat|lawsuit|court/.test(text)
          ? "regulatory"
          : /exchange|listing/.test(text)
            ? "exchange"
            : /network upgrade|hard fork|testnet|mainnet|outage|protocol/.test(
                  text,
                )
              ? "blockchain"
              : /partnership|partners with|integration/.test(text)
                ? "partnerships"
                : /token unlock|token burn|supply|tokenomics/.test(text)
                  ? "tokenomics"
                  : /ecosystem|developer|grants/.test(text)
                    ? "ecosystem"
                    : /sentiment|fear|greed/.test(text)
                      ? "sentiment"
                      : "general";
  const rumor = /rumou?r|unconfirmed|reportedly|alleged|speculat/.test(text),
    conflict = /denies|refutes|disputes|contradict/.test(text);
  const timestamp = published ? Date.parse(published) : NaN;
  const current =
    Number.isFinite(timestamp) &&
    timestamp <= now + 300000 &&
    now - timestamp < 86400000;
  const impact =
    category === "security"
      ? 40
      : ["macro", "regulatory", "etf"].includes(category)
        ? 30
        : 10;
  const score = !current
    ? 0
    : Math.min(
        rumor || conflict ? 39 : 100,
        impact +
          (official ? 20 : 5) +
          (assets.length ? 15 : 0) +
          (now - timestamp < 21600000 ? 20 : 10),
      );
  const priority = !current
    ? "low"
    : score >= 85 && official && category === "security" && !rumor && !conflict
      ? "critical"
      : score >= 55 && impact >= 30
        ? "high"
        : score >= 25
          ? "medium"
          : "low";
  return {
    assets,
    category,
    priority,
    score,
    scoreFactors: {
      impact,
      source: official ? "Primary publisher" : "Secondary reporting",
      assetRelevance: assets,
      recent: current,
      uncertaintyPenalty: rumor || conflict,
    },
    verification: rumor
      ? "unconfirmed"
      : conflict
        ? "disputed"
        : official
          ? "official_source"
          : "reported",
    sentiment: "unrated",
    current,
    reason: !current
      ? "Historical headline or publication time unavailable. Recheck current conditions."
      : "Headline-based classification. Read the original source before drawing conclusions about market impact.",
  };
}
export function storyCluster(title: string, published?: string | null) {
  return createHash("sha256")
    .update(
      (published ? published.slice(0, 10) + ":" : "") +
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, " ")
          .trim(),
    )
    .digest("hex");
}

export type NewsEvidence = {
  id: string;
  title: string;
  canonical_url: string;
  source: string;
  published_at: string | Date | null;
  cluster_id: string;
  classification: ReturnType<typeof classifyNews>;
};
export function relatedCoverage(
  article: NewsEvidence,
  candidates: NewsEvidence[],
) {
  const time = new Date(article.published_at ?? "").getTime();
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .match(/[a-z]{4,}/g)
        ?.filter(
          (w) =>
            ![
              "with",
              "from",
              "that",
              "after",
              "says",
              "denies",
              "denied",
              "rejects",
              "approves",
              "reports",
            ].includes(w),
        ) ?? [],
    );
  const own = words(article.title);
  return candidates
    .filter((other) => {
      const otherTime = new Date(other.published_at ?? "").getTime();
      if (
        other.id === article.id ||
        !Number.isFinite(time) ||
        !Number.isFinite(otherTime) ||
        Math.abs(otherTime - time) > 172800000
      )
        return false;
      if (other.cluster_id === article.cluster_id) return true;
      if (
        other.classification.category !== article.classification.category ||
        !article.classification.assets.some((a) =>
          other.classification.assets.includes(a),
        )
      )
        return false;
      const theirs = words(other.title);
      return (
        [...own].filter((w) => theirs.has(w)).length >= 3 &&
        [...own].filter((w) => theirs.has(w)).length /
          Math.max(own.size, theirs.size) >=
          0.6
      );
    })
    .slice(0, 8)
    .map((other) => ({
      id: other.id,
      title: other.title,
      url: other.canonical_url,
      source: other.source,
      publishedAt: other.published_at,
      relationship:
        other.classification.verification === "disputed" ||
        article.classification.verification === "disputed" ||
        (/\b(approv\w*|accept\w*)\b/i.test(article.title) &&
          /\b(reject\w*|deny|denies)\b/i.test(other.title)) ||
        (/\b(approv\w*|accept\w*)\b/i.test(other.title) &&
          /\b(reject\w*|deny|denies)\b/i.test(article.title))
          ? "potential_conflict"
          : "related_reporting",
      primarySource: other.classification.verification === "official_source",
      independence:
        "Not established; publishers may repeat the same original report",
    }));
}
export function sameHeadlineEvent(a: string, b: string) {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 2 &&
            ![
              "the",
              "and",
              "for",
              "with",
              "from",
              "says",
              "after",
              "new",
            ].includes(w),
        ),
    );
  const x = tokens(a),
    y = tokens(b);
  for (const term of [
    "not",
    "denies",
    "denied",
    "refutes",
    "rumor",
    "unconfirmed",
    "approves",
    "approved",
    "rejects",
    "rejected",
    "delays",
    "delayed",
    "postponed",
    "hack",
    "exploit",
  ])
    if (x.has(term) !== y.has(term)) return false;
  const nums = (s: string) =>
    (s.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");
  if (nums(a) !== nums(b) || Math.min(x.size, y.size) < 5) return false;
  const common = [...x].filter((t) => y.has(t)).length;
  return common / new Set([...x, ...y]).size >= 0.8;
}
