export async function providerText(
  url: string,
  headers: Record<string, string> = {},
  limit = 2000000,
): Promise<string> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(
      res.status === 429 ? "Provider rate limited" : "Provider unavailable",
    );
  }
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function providerJson(url: string) {
  return JSON.parse(await providerText(url)) as unknown;
}
