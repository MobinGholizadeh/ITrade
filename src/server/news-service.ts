import { createHash } from "node:crypto";
import { providerText } from "./provider-http";
import {
  canonicalUrl,
  classifyNews,
  storyCluster,
  sameHeadlineEvent,
  relatedCoverage,
  type NewsEvidence,
} from "../domain/news";
import { getDb } from "./db";
import { serviceStatus } from "./market-service";
import { createAlert } from "./technical-service";
import { readSettings } from "./settings-repository";
import {
  newsFeeds,
  parseFeed,
  cryptoPanicHeadlines,
  type Headline,
} from "./news-providers";
async function storeHeadline(item: Headline) {
  const rawDate = Date.parse(item.published ?? "");
  const published =
    Number.isFinite(rawDate) && rawDate <= Date.now() + 300000
      ? new Date(rawDate).toISOString()
      : null;
  const url = canonicalUrl(item.url),
    title = item.title.replace(/<[^>]*>/g, "").slice(0, 500);
  const id = createHash("sha256").update(url).digest("hex");
  const classification = classifyNews(title, item.official, published);
  let cluster = storyCluster(title, published ?? new Date().toISOString());
  if (published) {
    const candidates = (
      await getDb().query(
        "SELECT title,cluster_id,classification FROM news_articles WHERE published_at BETWEEN $1::timestamptz-interval '48 hours' AND $1::timestamptz+interval '48 hours' ORDER BY published_at DESC LIMIT 200",
        [published],
      )
    ).rows;
    const match = candidates.find(
      (c) =>
        c.classification.verification === classification.verification &&
        c.classification.category === classification.category &&
        JSON.stringify(c.classification.assets) ===
          JSON.stringify(classification.assets) &&
        sameHeadlineEvent(c.title, title),
    );
    if (match) cluster = match.cluster_id;
  }
  const inserted = await getDb().query(
    "INSERT INTO news_articles(id,canonical_url,source,title,published_at,cluster_id,classification) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(canonical_url) DO NOTHING RETURNING id",
    [
      id,
      url,
      item.source,
      title,
      published,
      cluster,
      JSON.stringify(classification),
    ],
  );
  if (
    inserted.rows.length &&
    classification.current &&
    ["high", "critical"].includes(classification.priority) &&
    !["unconfirmed", "disputed"].includes(classification.verification)
  ) {
    const { settings } = await readSettings();
    const affected =
      classification.category === "macro"
        ? settings.trackedAssets
        : settings.trackedAssets.filter((a) =>
            classification.assets.includes(a),
          );
    for (const asset of affected)
      await createAlert(
        `news:${cluster}:${asset}`,
        asset,
        "important_news",
        classification.priority,
        {
          news: {
            id,
            title,
            source: item.source,
            url,
            published,
            classification,
          },
          note: "Headline impact needs context review; no causal price attribution or independent confirmation inferred.",
        },
        settings.alertCooldownMinutes,
      );
  }
}
export async function ingestNews() {
  let succeeded = 0;
  for (const feed of newsFeeds) {
    try {
      const headlines = parseFeed(
        await providerText(
          feed.url,
          { "User-Agent": "ITrade personal research RSS reader" },
          1500000,
        ),
        feed.name,
        feed.official,
      );
      for (const h of headlines) {
        try {
          canonicalUrl(h.url);
        } catch {
          continue;
        }
        await storeHeadline(h);
      }
      succeeded++;
      await serviceStatus(
        `news:${feed.name}`,
        "online",
        "RSS/Atom headline metadata ingested",
      );
    } catch {
      await serviceStatus(
        `news:${feed.name}`,
        "offline",
        "Feed unavailable; previous dated headlines retained",
      );
    }
  }
  if (process.env.CRYPTOPANIC_API_KEY) {
    const interval = Math.max(
      3600,
      Number(process.env.CRYPTOPANIC_POLL_SECONDS) || 3600,
    );
    const last = (
      await getDb().query(
        "SELECT checked_at FROM service_status WHERE name='news:CryptoPanic'",
      )
    ).rows[0];
    if (
      !last ||
      Date.now() - new Date(last.checked_at).getTime() > interval * 1000
    ) {
      try {
        for (const h of await cryptoPanicHeadlines()) await storeHeadline(h);
        await serviceStatus(
          "news:CryptoPanic",
          "online",
          "Plan-specific API headlines ingested",
        );
      } catch {
        await serviceStatus(
          "news:CryptoPanic",
          "offline",
          "API unavailable, invalid response or plan quota exhausted",
        );
      }
    }
  } else
    await serviceStatus(
      "news:CryptoPanic",
      "not_configured",
      "Optional CryptoPanic API key not configured",
    );
  await serviceStatus(
    "news",
    succeeded ? "online" : "offline",
    `${succeeded}/${newsFeeds.length} RSS feeds available; headline metadata only`,
  );
}
export async function listNews(asset?: string) {
  const rows = (
    await getDb().query(
      "SELECT n.*,a.result analysis FROM news_articles n LEFT JOIN LATERAL (SELECT result FROM ai_analyses WHERE kind='news' AND context->>'newsId'=n.id ORDER BY created_at DESC LIMIT 1) a ON true WHERE ($1::text IS NULL OR classification->'assets' ? $1) ORDER BY published_at DESC NULLS LAST LIMIT 100",
      [asset ?? null],
    )
  ).rows;
  const classified = rows.map((row) => ({
    ...row,
    classification: classifyNews(
      row.title,
      newsFeeds.some((f) => f.name === row.source && f.official),
      row.published_at?.toISOString() ?? null,
    ),
  }));
  return classified.map((row) => ({
    ...row,
    coverage: relatedCoverage(
      row as NewsEvidence,
      classified as NewsEvidence[],
    ),
  }));
}
export async function newsContext(id: string) {
  const n = (
    await getDb().query("SELECT * FROM news_articles WHERE id=$1", [id])
  ).rows[0];
  if (!n) return null;
  const candidates = (
    await getDb().query(
      "SELECT * FROM news_articles WHERE published_at BETWEEN $1::timestamptz-interval '48 hours' AND $1::timestamptz+interval '48 hours' ORDER BY published_at DESC LIMIT 100",
      [n.published_at],
    )
  ).rows;
  const coverage = relatedCoverage(n, candidates);
  return {
    asset: null,
    newsId: n.id,
    dataTimestamp: (n.published_at ?? n.received_at).toISOString(),
    evidenceIds: [`news:${n.id}`, ...coverage.map((c) => `news:${c.id}`)],
    news: {
      title: n.title,
      source: n.source,
      url: n.canonical_url,
      publishedAt: n.published_at,
      classification: classifyNews(
        n.title,
        newsFeeds.some((f) => f.name === n.source && f.official),
        n.published_at?.toISOString() ?? null,
      ),
    },
    coverage,
    limitations:
      "Headline metadata only, not full articles. Related coverage is a lexical match, not independent corroboration. Potential conflicts require original-source review. No live price-response evidence: whether priced in must remain unknown. Sentiment describes possible headline implications, not observed market reaction.",
  };
}

export function compactNews(rows: Awaited<ReturnType<typeof listNews>>) {
  // Prevent stored model prose from becoming recursively repeated evidence.
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    source: n.source,
    url: n.canonical_url,
    publishedAt: n.published_at,
    classification: n.classification,
    coverage: n.coverage.slice(0, 3),
  }));
}
