import { getRuntime } from "@/composition/server";

const HEARTBEAT_MS = 15_000;

/**
 * ### GET
 *
 * Server-sent events: one `data:` line per `LiveUpdate`, plus comment
 * heartbeats so idle proxies keep the connection open.
 *
 * @returns An endless `text/event-stream` that ends when the client disconnects.
 */
export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      // A closed or cancelled stream throws on enqueue; stop listening instead of throwing into the runtime.
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup?.();
        }
      };
      const unsubscribe = getRuntime().subscribe((update) => send(`data: ${JSON.stringify(update)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        cleanup = undefined;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      // Flush headers immediately; EventSource fires `open` only once bytes arrive.
      send(": connected\n\n");
      request.signal.addEventListener("abort", () => cleanup?.(), { once: true });
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
