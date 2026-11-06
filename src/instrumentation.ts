/**
 * ### register
 *
 * Runs once when the server starts (see `instrumentation-node.ts`).
 */
export async function register(): Promise<void> {
  // Imported only on Node: the module uses Node APIs that the Edge runtime lacks.
  if (process.env.NEXT_RUNTIME === "nodejs") (await import("./instrumentation-node")).watchParent();
}
