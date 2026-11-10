export class BodyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readJsonBody(
  request: Request,
  maxBytes = 16384,
): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new BodyError("JSON required", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError("Missing body", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BodyError("Request too large", 413);
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new BodyError("Invalid JSON", 400);
    }
  } finally {
    reader.releaseLock();
  }
}
