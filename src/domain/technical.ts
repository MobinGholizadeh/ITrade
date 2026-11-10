import {
  ema,
  contiguous,
  intervals,
  type Candle,
  type Timeframe,
} from "./market";
export function rsi(values: number[], p = 14) {
  if (values.length <= p) return null;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0) / p;
    loss += Math.max(-d, 0) / p;
  }
  for (let i = p + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (p - 1) + Math.max(d, 0)) / p;
    loss = (loss * (p - 1) + Math.max(-d, 0)) / p;
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}
export function atr(cs: Candle[], p = 14) {
  if (cs.length <= p) return null;
  const trs = cs
    .slice(1)
    .map((c, i) =>
      Math.max(
        c.high - c.low,
        Math.abs(c.high - cs[i].close),
        Math.abs(c.low - cs[i].close),
      ),
    );
  let v = trs.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (const t of trs.slice(p)) v = (v * (p - 1) + t) / p;
  return v;
}
export function macd(values: number[]) {
  const fast = ema(values, 12),
    slow = ema(values, 26);
  const line = values.flatMap((_, i) =>
    slow[i] === null ? [] : [fast[i]! - slow[i]!],
  );
  const signals = ema(line, 9);
  const value = line.at(-1) ?? null,
    signal = signals.at(-1) ?? null;
  return {
    value,
    signal,
    histogram: value !== null && signal !== null ? value - signal : null,
  };
}
export function swings(cs: Candle[], width = 2) {
  const highs: { time: number; price: number }[] = [],
    lows: { time: number; price: number }[] = [];
  for (let i = width; i < cs.length - width; i++) {
    const neighbors = cs
      .slice(i - width, i + width + 1)
      .filter((_, j) => j !== width);
    if (neighbors.every((c) => cs[i].high > c.high))
      highs.push({ time: cs[i].time, price: cs[i].high });
    if (neighbors.every((c) => cs[i].low < c.low))
      lows.push({ time: cs[i].time, price: cs[i].low });
  }
  return { highs, lows };
}
export function technical(
  cs: Candle[],
  tf: Timeframe,
  now = Date.now(),
  options = { swingWidth: 2, volumeConfirmation: 1.5, zoneAtr: 0.25 },
) {
  const last = cs.at(-1),
    fresh =
      !!last &&
      now / 1000 - (last.time + intervals[tf]) <= intervals[tf] + 90 &&
      last.time + intervals[tf] <= now / 1000;
  if (cs.length < 200 || !contiguous(cs, intervals[tf]) || !fresh)
    return {
      ready: false as const,
      reason:
        cs.length < 200
          ? "At least 200 closed candles required"
          : !fresh
            ? "Closed candle history is stale"
            : "Candle gaps require recovery",
    };
  const closes = cs.map((c) => c.close),
    e20 = ema(closes, 20).at(-1)!,
    e50 = ema(closes, 50).at(-1)!,
    e200 = ema(closes, 200).at(-1)!,
    vol = cs.slice(-21, -1).reduce((a, c) => a + c.volume, 0) / 20,
    relativeVolume = vol ? last!.volume / vol : null;
  const { highs, lows } = swings(cs.slice(0, -1), options.swingWidth);
  const resistance =
      highs.filter((s) => s.price >= cs.at(-2)!.close).at(-1)?.price ?? null,
    support =
      lows.filter((s) => s.price <= cs.at(-2)!.close).at(-1)?.price ?? null;
  const hh = highs.length >= 2 && highs.at(-1)!.price > highs.at(-2)!.price,
    hl = lows.length >= 2 && lows.at(-1)!.price > lows.at(-2)!.price;
  const lh = highs.length >= 2 && highs.at(-1)!.price < highs.at(-2)!.price,
    ll = lows.length >= 2 && lows.at(-1)!.price < lows.at(-2)!.price;
  const structure =
    hh && hl ? "bullish" : lh && ll ? "bearish" : "consolidation";
  const volatility = atr(cs)!;
  const momentum = rsi(closes),
    previousRsi = rsi(closes.slice(0, -1));
  const breakout =
    resistance !== null &&
    cs.at(-2)!.close <= resistance &&
    last!.close > resistance &&
    (relativeVolume ?? 0) >= options.volumeConfirmation;
  const breakdown =
    support !== null &&
    cs.at(-2)!.close >= support &&
    last!.close < support &&
    (relativeVolume ?? 0) >= options.volumeConfirmation;
  const supportTouch =
    support !== null &&
    last!.low <= support + volatility * options.zoneAtr &&
    last!.close >= support;
  const pivotHigh = highs.at(-1)?.price,
    pivotLow = lows.at(-1)?.price;
  const failedBreakout =
    pivotHigh !== undefined &&
    cs.at(-2)!.close > pivotHigh &&
    last!.close < pivotHigh;
  const breakoutRetest =
    pivotHigh !== undefined &&
    cs.at(-2)!.close > pivotHigh &&
    last!.low <= pivotHigh + volatility * options.zoneAtr &&
    last!.close > pivotHigh;
  const resistanceRetest =
    pivotLow !== undefined &&
    cs.at(-2)!.close < pivotLow &&
    last!.high >= pivotLow - volatility * options.zoneAtr &&
    last!.close < pivotLow;
  const reversalWarning =
    (structure === "bullish" && last!.close < e50! && momentum! < 50) ||
    (structure === "bearish" && last!.close > e50! && momentum! > 50);
  const state = failedBreakout
    ? "failed_breakout"
    : breakoutRetest
      ? "breakout_retest_watch"
      : resistanceRetest
        ? "resistance_retest_watch"
        : reversalWarning
          ? "reversal_warning"
          : breakout
            ? "breakout_watch"
            : breakdown
              ? "breakdown_watch"
              : supportTouch
                ? "support_test_unconfirmed"
                : "no_opportunity";
  return {
    ready: true as const,
    close: last!.close,
    timeframe: tf,
    dataTimestamp: new Date((last!.time + intervals[tf]) * 1000).toISOString(),
    ema20: e20,
    ema50: e50,
    ema200: e200,
    rsi: momentum,
    previousRsi,
    macd: macd(closes),
    atr: volatility,
    volumeAverage: vol,
    relativeVolume,
    swings: { highs: highs.slice(-5), lows: lows.slice(-5) },
    support,
    resistance,
    structure,
    state,
    volumeSpike: (relativeVolume ?? 0) >= 2,
    unusualVolatility: last!.high - last!.low > volatility * 2,
    rsiCondition:
      momentum! <= 30 ? "oversold" : momentum! >= 70 ? "overbought" : "neutral",
    confirmation: breakout
      ? "Watch a retest holding above broken resistance on closed candles"
      : breakdown
        ? "Watch a failed recovery of broken support on closed candles"
        : "A zone touch alone is not confirmation",
    invalidation: breakout
      ? `Close back below ${resistance}`
      : breakdown
        ? `Close back above ${support}`
        : "Loss of the tested support on a closed candle",
    risk: "Whipsaws, news shocks, slippage and incomplete venue coverage can invalidate this observation",
  };
}
export function relativeStrength(asset: Candle[], btc: Candle[]) {
  const b = new Map(btc.map((c) => [c.time, c.close]));
  const pairs = asset.filter((c) => b.has(c.time)).slice(-21);
  if (pairs.length < 21) return null;
  const interval = pairs[1].time - pairs[0].time;
  if (
    !pairs.every((c, i) => i === 0 || c.time - pairs[i - 1].time === interval)
  )
    return null;
  const first = pairs[0],
    last = pairs.at(-1)!;
  return (
    (last.close / first.close / (b.get(last.time)! / b.get(first.time)!) - 1) *
    100
  );
}
