import { z } from "zod";
import { getDb } from "./db";
import { marketOverview, marketHistory } from "./market-service";
import { assetTechnical } from "./technical-service";
import { listNews, compactNews } from "./news-service";
import { portfolioSummary } from "./portfolio-service";
import { assetSchema as validAsset, intervals } from "../domain/market";
import { institutionalContext } from "./institutional-context";
export const toolNames = [
  "get_market_overview",
  "get_asset_price",
  "get_asset_ohlcv",
  "get_asset_indicators",
  "get_asset_market_structure",
  "get_asset_news",
  "search_news",
  "get_portfolio_summary",
  "get_asset_holding",
  "get_portfolio_allocation",
  "get_active_alerts",
  "get_alert_history",
  "get_institutional_flows",
  "get_market_data_freshness",
] as const;
export async function readAnalystTool(name: string, args: unknown = {}) {
  const tool = z.enum(toolNames).parse(name);
  const input = z
    .object({
      asset: validAsset.optional(),
      timeframe: z
        .enum(
          Object.keys(intervals) as [
            keyof typeof intervals,
            ...(keyof typeof intervals)[],
          ],
        )
        .default("4h"),
      query: z.string().max(100).optional(),
    })
    .strict()
    .parse(args);
  switch (tool) {
    case "get_market_overview":
    case "get_market_data_freshness":
      return marketOverview();
    case "get_asset_price":
      return (await marketOverview()).filter((q) => q.asset === input.asset);
    case "get_asset_ohlcv":
      return (
        await marketHistory(validAsset.parse(input.asset), input.timeframe)
      ).slice(-40);
    case "get_asset_indicators":
    case "get_asset_market_structure":
      return assetTechnical(validAsset.parse(input.asset), input.timeframe);
    case "get_asset_news":
      return compactNews(
        (await listNews(validAsset.parse(input.asset))).slice(0, 8),
      );
    case "search_news":
      return compactNews(
        (await listNews())
          .filter(
            (n) =>
              !input.query ||
              n.title.toLowerCase().includes(input.query.toLowerCase()),
          )
          .slice(0, 10),
      );
    case "get_portfolio_summary":
    case "get_portfolio_allocation":
    case "get_asset_holding": {
      const p = await portfolioSummary();
      return {
        totalValue: p.totalValue,
        complete: p.complete,
        coverage: p.coverage,
        currency: p.currency,
        holdings: p.holdings
          .filter(
            (h) => tool !== "get_asset_holding" || h.asset === input.asset,
          )
          .slice(0, 40)
          .map(({ asset, quantity, value, pnl, allocation, updated_at }) => ({
            asset,
            quantity,
            value,
            pnl,
            allocation,
            updated_at,
          })),
      };
    }
    case "get_active_alerts":
    case "get_alert_history":
      return (
        await getDb().query(
          "SELECT id,asset,type,status,evidence,explanation,created_at FROM alerts WHERE ($1::boolean=false OR status='active') ORDER BY created_at DESC LIMIT 8",
          [tool === "get_active_alerts"],
        )
      ).rows;
    case "get_institutional_flows":
      return institutionalContext();
  }
}
