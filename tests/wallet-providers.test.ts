import { it, expect, vi, afterEach } from "vitest";
import { walletBalances } from "../src/server/portfolio-providers";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("preserves EVM integer precision without signing or transaction RPCs", async () => {
  vi.stubEnv("ALCHEMY_API_KEY", "test-key");
  const methods: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      methods.push(body.method);
      return Response.json({
        result:
          body.method === "eth_getBalance"
            ? "0xde0b6b3a7640001"
            : { tokenBalances: [] },
      });
    }),
  );
  expect(await walletBalances("ethereum", "0x" + "1".repeat(40))).toEqual([
    { asset: "ETH", quantity: "1.000000000000000001" },
  ]);
  expect(methods).toEqual(["eth_getBalance", "alchemy_getTokenBalances"]);
});
it("aggregates SPL token accounts by mint, not untrusted ticker name", async () => {
  vi.stubEnv("HELIUS_API_KEY", "test-key");
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const b = JSON.parse(init.body);
      if (b.method === "getBalance")
        return Response.json({ result: { value: 1000000001 } });
      calls++;
      const row = {
        account: {
          data: {
            parsed: {
              info: {
                mint: "1".repeat(32),
                tokenAmount: { amount: "1000000000000000001", decimals: 18 },
              },
            },
          },
        },
      };
      return Response.json({
        result: { value: calls === 1 ? [row, row] : [] },
      });
    }),
  );
  expect(await walletBalances("solana", "1".repeat(32))).toEqual([
    { asset: "SOL", quantity: "1.000000001" },
    { asset: "solana:" + "1".repeat(32), quantity: "2.000000000000000002" },
  ]);
});
it("rejects partial RPC errors rather than replacing balances with zero", async () => {
  vi.stubEnv("ALCHEMY_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: { code: -32000 } })),
  );
  await expect(
    walletBalances("ethereum", "0x" + "1".repeat(40)),
  ).rejects.toThrow();
});
it("keeps ERC-20 identities separate across EVM networks", async () => {
  vi.stubEnv("ALCHEMY_API_KEY", "test-key");
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      urls.push(String(url));
      const b = JSON.parse(init.body);
      return Response.json({
        result:
          b.method === "eth_getBalance"
            ? "0x0"
            : b.method === "alchemy_getTokenBalances"
              ? {
                  tokenBalances: [
                    {
                      contractAddress: "0x" + "a".repeat(40),
                      tokenBalance: "0x64",
                    },
                  ],
                }
              : { decimals: 2 },
      });
    }),
  );
  for (const kind of ["base", "arbitrum", "optimism"] as const) {
    expect((await walletBalances(kind, "0x" + "1".repeat(40)))[1]).toEqual({
      asset: kind + ":0x" + "a".repeat(40),
      quantity: "1",
    });
  }
  expect(urls.some((u) => u.startsWith("https://base-mainnet."))).toBe(true);
  expect(urls.some((u) => u.startsWith("https://arb-mainnet."))).toBe(true);
  expect(urls.some((u) => u.startsWith("https://opt-mainnet."))).toBe(true);
});
