import { z } from "zod";
import type { Candle } from "./market";
export const flowSchema = z
  .object({
    provider: z.string().min(1).max(80),
    fund: z.string().min(1).max(40),
    asset: z.enum(["BTC", "ETH", "SOL"]),
    reportDate: z.iso.date(),
    publishedAt: z.iso.datetime(),
    netFlowUsd: z
      .string()
      .regex(/^-?\d{1,18}(\.\d{1,8})?$/)
      .nullable(),
    sourceUrl: z.url().refine((v) => new URL(v).protocol === "https:"),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.publishedAt) >= Date.parse(v.reportDate) &&
      Date.parse(v.publishedAt) <= Date.now() + 300000,
    "Invalid publication chronology",
  );
export function correlation(a: Candle[], b: Candle[], minimum = 20) {
  const returns = (cs: Candle[]) =>
    new Map(
      cs
        .slice(1)
        .flatMap((c, i) =>
          c.time - cs[i].time === 86400
            ? [[c.time, c.close / cs[i].close - 1] as const]
            : [],
        ),
    );
  const ar = returns(a),
    br = returns(b);
  const pairs = [...ar]
    .filter(([t]) => br.has(t))
    .map(([t, x]) => [x, br.get(t)!]);
  return pairedCorrelation(pairs, minimum);
}
function pairedCorrelation(pairs: number[][], minimum = 20) {
  if (pairs.length < minimum)
    return { coefficient: null, observations: pairs.length };
  const mean = (i: number) =>
      pairs.reduce((s, p) => s + p[i], 0) / pairs.length,
    mx = mean(0),
    my = mean(1);
  let cov = 0,
    va = 0,
    vb = 0;
  for (const [x, y] of pairs) {
    cov += (x - mx) * (y - my);
    va += (x - mx) ** 2;
    vb += (y - my) ** 2;
  }
  return {
    coefficient: va && vb ? cov / Math.sqrt(va * vb) : null,
    observations: pairs.length,
  };
}

export function flowPriceCorrelation(
  flows: { reportDate: string; netFlowUsd: string | null }[],
  candles: Candle[],
) {
  const daily = new Map(
    candles
      .slice(1)
      .flatMap((c, i) =>
        c.time - candles[i].time === 86400
          ? [
              [
                new Date(c.time * 1000).toISOString().slice(0, 10),
                c.close / candles[i].close - 1,
              ] as const,
            ]
          : [],
      ),
  );
  const unique = new Map(flows.map((f) => [f.reportDate, f.netFlowUsd]));
  const pairs = [...unique]
    .filter(
      ([date, flow]) =>
        flow !== null && Number.isFinite(Number(flow)) && daily.has(date),
    )
    .map(([date, flow]) => [Number(flow), daily.get(date)!]);
  return pairedCorrelation(pairs);
}
export function calendarTimestamp(value: string) {
  const normalized = value.replace(" ", "T");
  return new Date(
    normalized + (/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? "" : "Z"),
  ).toISOString();
}
export function breadth(rows: { ready: boolean; structure?: string }[]) {
  const valid = rows.filter((r) => r.ready);
  return {
    coverage: valid.length,
    bullish: valid.filter((r) => r.structure === "bullish").length,
    bearish: valid.filter((r) => r.structure === "bearish").length,
    neutral: valid.filter((r) => r.structure === "consolidation").length,
    label: valid.length
      ? "Technical breadth, not investor sentiment"
      : "Insufficient technical data",
  };
}
