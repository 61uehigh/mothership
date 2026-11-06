"use client";

import { useEffect } from "react";

/** The key the workbench saves its layout and open tabs under (see `WorkbenchContext`). */
const LAYOUT_KEY = "mothership.workbench";

const button = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
} as const;

/**
 * ### GlobalError
 *
 * Shown instead of a blank window when the app frame itself fails to render.
 * It renders its own document (the app's styles don't load here). Resetting
 * the layout clears saved tabs and sidebars, the most likely cause of a
 * failure that repeats on every load.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[mothership] the app failed to render", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0c0c0e", color: "#e4e4e7", fontFamily: "system-ui, sans-serif" }}>
        <title>mothership</title>
        <main style={{ maxWidth: 420, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, margin: 0, color: "#a1a1aa" }}>
            mothership hit an error while drawing the window. Try again, or reset the layout (open tabs and sidebar arrangement) if it keeps happening.
          </p>
          {error instanceof Error && <pre style={{ fontSize: 11, color: "#f87171", whiteSpace: "pre-wrap", margin: 0 }}>{error.message}</pre>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...button, background: "#0d9488", borderColor: "#0d9488", color: "white" }} onClick={() => retry()}>
              Try again
            </button>
            <button
              type="button"
              style={button}
              onClick={() => {
                try {
                  localStorage.removeItem(LAYOUT_KEY);
                } catch {
                  // Storage unavailable: a reload is still worth trying.
                }
                location.reload();
              }}
            >
              Reset layout and reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
