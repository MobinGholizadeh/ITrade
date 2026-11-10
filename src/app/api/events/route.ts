import "server-only";
import { getHealth } from "@/server/health";
import { marketOverview } from "@/server/market-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      stop = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        request.signal.removeEventListener("abort", stop);
        try {
          controller.close();
        } catch {
          /* The consumer may already have cancelled the stream. */
        }
      };
      request.signal.addEventListener("abort", stop, { once: true });
      const emit = async () => {
        try {
          const health = await getHealth();
          const quotes = await marketOverview().catch(() => []);
          if (!closed)
            controller.enqueue(
              encoder.encode(
                `event: market\ndata: ${JSON.stringify({ quotes })}\n\n`,
              ),
            );
          if (!closed)
            controller.enqueue(
              encoder.encode(
                `event: health\ndata: ${JSON.stringify(health)}\n\n`,
              ),
            );
        } catch {
          if (!closed)
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
        }
        if (!closed) timer = setTimeout(emit, 10000);
      };
      if (request.signal.aborted) stop();
      else void emit();
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
