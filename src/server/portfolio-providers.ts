import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import Decimal from "decimal.js";
import { assertReadOnly } from "../domain/portfolio";
import { getRedis, readyRedis } from "./redis";
const D = Decimal.clone({ precision: 60 });
export const krakenCredentials = z
  .object({
    apiKey: z.string().min(10).max(200),
    secret: z.string().min(10).max(300),
  })
  .strict();
export async function krakenRead(
  credentials: z.infer<typeof krakenCredentials>,
  endpoint: "GetApiKeyInfo" | "Balance",
) {
  await readyRedis();
  const nonceKey = `itrade:nonce:${createHash("sha256").update(credentials.apiKey).digest("hex")}`;
  const nonce = String(
    await getRedis().eval(
      "local old=tonumber(redis.call('GET',KEYS[1]) or '0'); local n=math.max(old+1,tonumber(ARGV[1]));redis.call('SET',KEYS[1],n,'EX',86400);return n",
      1,
      nonceKey,
      Date.now() * 1000,
    ),
  );
  const body = new URLSearchParams({ nonce }).toString(),
    path = `/0/private/${endpoint}`,
    hash = createHash("sha256")
      .update(nonce + body)
      .digest();
  const sign = createHmac("sha512", Buffer.from(credentials.secret, "base64"))
    .update(Buffer.concat([Buffer.from(path), hash]))
    .digest("base64");
  const r = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": credentials.apiKey,
      "API-Sign": sign,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Exchange request unavailable");
  const data = z
    .object({ error: z.array(z.string()), result: z.unknown().optional() })
    .parse(await r.json());
  if (data.error.length) throw Error("Exchange rejected read-only request");
  return data.result;
}
export async function verifyKraken(
  credentials: z.infer<typeof krakenCredentials>,
) {
  const info = z
    .object({ permissions: z.array(z.string()) })
    .parse(await krakenRead(credentials, "GetApiKeyInfo"));
  assertReadOnly(info.permissions);
}
export async function krakenBalances(
  credentials: z.infer<typeof krakenCredentials>,
) {
  await verifyKraken(credentials);
  const data = z
    .record(z.string(), z.string().regex(/^\d+(\.\d+)?$/))
    .parse(await krakenRead(credentials, "Balance"));
  const symbols: Record<string, string> = {
    XXBT: "BTC",
    XBT: "BTC",
    XETH: "ETH",
    ZUSD: "USD",
  };
  return Object.entries(data).map(([asset, quantity]) => ({
    asset: symbols[asset] ?? asset,
    quantity,
  }));
}
async function rpc(url: string, method: string, params: unknown[]) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Wallet provider unavailable");
  const data = z
    .object({ result: z.unknown().optional(), error: z.unknown().optional() })
    .parse(await r.json());
  if (data.error || data.result === undefined)
    throw Error("Wallet provider rejected read request");
  return data.result;
}
export async function walletBalances(
  kind: "ethereum" | "base" | "arbitrum" | "optimism" | "solana",
  address: string,
) {
  if (kind !== "solana") {
    if (!process.env.ALCHEMY_API_KEY)
      throw Error("Alchemy API key not configured");
    const networks = {
      ethereum: "eth-mainnet",
      base: "base-mainnet",
      arbitrum: "arb-mainnet",
      optimism: "opt-mainnet",
    };
    const url = `https://${networks[kind]}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
    const value = z
      .string()
      .regex(/^0x[0-9a-f]+$/i)
      .parse(await rpc(url, "eth_getBalance", [address, "finalized"]));
    const balances = [
      {
        asset: "ETH",
        quantity: new D(BigInt(value).toString()).div("1e18").toFixed(),
      },
    ];
    let pageKey: string | undefined;
    for (let page = 0; page < 10; page++) {
      const tokens = z
        .object({
          pageKey: z.string().optional(),
          tokenBalances: z.array(
            z.object({
              contractAddress: z.string().regex(/^0x[0-9a-f]{40}$/i),
              tokenBalance: z
                .string()
                .regex(/^0x[0-9a-f]+$/i)
                .nullable(),
              error: z.string().nullable().optional(),
            }),
          ),
        })
        .parse(
          await rpc(url, "alchemy_getTokenBalances", [
            address,
            "erc20",
            { maxCount: 100, ...(pageKey ? { pageKey } : {}) },
          ]),
        );
      for (const token of tokens.tokenBalances) {
        if (token.error || token.tokenBalance === null)
          throw Error("Incomplete token balance data");
        const raw = BigInt(token.tokenBalance);
        if (raw === 0n) continue;
        const meta = z
          .object({ decimals: z.number().int().min(0).max(36) })
          .parse(
            await rpc(url, "alchemy_getTokenMetadata", [token.contractAddress]),
          );
        balances.push({
          asset: `${kind}:${token.contractAddress.toLowerCase()}`,
          quantity: new D(raw.toString())
            .div(new D(10).pow(meta.decimals))
            .toFixed(),
        });
      }
      pageKey = tokens.pageKey;
      if (!pageKey) return balances;
    }
    throw Error("Wallet token pagination exceeds coverage limit");
  }
  if (!process.env.HELIUS_API_KEY) throw Error("Helius API key not configured");
  const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  const value = z
    .object({
      value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .parse(
      await rpc(url, "getBalance", [address, { commitment: "finalized" }]),
    );
  const balances = new Map<string, Decimal>([
    ["SOL", new D(value.value).div("1e9")],
  ]);
  for (const programId of [
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ]) {
    const data = z
      .object({
        value: z
          .array(
            z.object({
              account: z.object({
                data: z.object({
                  parsed: z.object({
                    info: z.object({
                      mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
                      tokenAmount: z.object({
                        amount: z.string().regex(/^\d+$/),
                        decimals: z.number().int().min(0).max(36),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          )
          .max(1000),
      })
      .parse(
        await rpc(url, "getTokenAccountsByOwner", [
          address,
          { programId },
          { encoding: "jsonParsed", commitment: "finalized" },
        ]),
      );
    for (const row of data.value) {
      const i = row.account.data.parsed.info,
        key = `solana:${i.mint}`,
        quantity = new D(i.tokenAmount.amount).div(
          new D(10).pow(i.tokenAmount.decimals),
        );
      balances.set(key, (balances.get(key) ?? new D(0)).add(quantity));
    }
  }
  return [...balances].map(([asset, quantity]) => ({
    asset,
    quantity: quantity.toFixed(),
  }));
}
