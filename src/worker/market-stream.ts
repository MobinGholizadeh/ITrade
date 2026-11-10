import { readSettings } from "../server/settings-repository";
import { saveQuote, serviceStatus } from "../server/market-service";
import { streamQuote, reconnectDelay } from "../domain/stream";
import {quoteFresh} from '../domain/market';
export function startMarketStream(onReconnect: () => void) {
  let stopped = false,
    socket: WebSocket | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    last = 0,
    failures = 0,
    lastHealth = 0;
  const persisted = new Map<string, number>(),
    sequences = new Map<string, number>();
  async function connect() {
    if (stopped) return;
    try {
      const { settings } = await readSettings(),
        provider = settings.marketProvider;
      const url =
        provider === "coinbase"
          ? "wss://ws-feed.exchange.coinbase.com"
          : provider === "kraken"
            ? "wss://ws.kraken.com/v2"
            : `wss://stream.binance.com:9443/stream?streams=${settings.trackedAssets.map((a) => `${a.toLowerCase()}usdt@ticker`).join("/")}`;
      socket = new WebSocket(url);
      last = Date.now();
      socket.onopen = () => {
        if (provider === "coinbase")
          socket?.send(
            JSON.stringify({
              type: "subscribe",
              product_ids: settings.trackedAssets.map((a) => `${a}-USD`),
              channels: ["ticker", "heartbeat"],
            }),
          );
        if (provider === "kraken")
          socket?.send(
            JSON.stringify({
              method: "subscribe",
              params: {
                channel: "ticker",
                symbol: settings.trackedAssets.map((a) => `${a}/USD`),
              },
            }),
          );
        onReconnect();
      };
      socket.onmessage = (event) => {
        last = Date.now();
        failures = 0;
        try {
          const raw = JSON.parse(String(event.data));
          const parsed = streamQuote(
            provider,
            provider === "binance" ? raw.data : raw,
          );
          if (!parsed) return;
          const { quote, sequence } = parsed;
          if(!quoteFresh(quote,Date.now(),settings.marketStaleAfterSeconds*1000))return;
          if (
            !settings.trackedAssets.includes(
              quote.asset as (typeof settings.trackedAssets)[number],
            ) ||
            sequence <= (sequences.get(quote.asset) ?? -1)
          )
            return;
          sequences.set(quote.asset, sequence);
          if (Date.now() - (persisted.get(quote.asset) ?? 0) < 2000) return;
          persisted.set(quote.asset, Date.now());
          void saveQuote(quote).catch(() => {});
          if (Date.now() - lastHealth > 30000) {
            lastHealth = Date.now();
            void serviceStatus(
              "market",
              "online",
              `${provider} WebSocket ticker received; candle history maintained separately`,
            ).catch(() => {});
          }
        } catch {}
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        sequences.clear();
        if (!stopped) {
          void serviceStatus(
            "market",
            "offline",
            "WebSocket disconnected; REST recovery scheduled",
          ).catch(() => {});
          timer = setTimeout(
            connect,
            reconnectDelay(failures++) + Math.random() * 500,
          );
        }
      };
    } catch {
      if (!stopped) timer = setTimeout(connect, reconnectDelay(failures++));
    }
  }
  const heartbeat = setInterval(() => {
    if (socket && Date.now() - last > 15000) socket.close();
  }, 5000);
  const configuration = setInterval(() => socket?.close(), 300000);
  void connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    clearInterval(configuration);
    socket?.close();
  };
}
