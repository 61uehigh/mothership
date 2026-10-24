import type { MetadataRoute } from "next";
import { APP_BACKGROUND } from "@/platform/appIcon";

/**
 * ### manifest
 *
 * Makes mothership installable as an app: Chrome's Install, or Safari's
 * Add to Dock, opens it in its own window with a Dock icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "mothership",
    short_name: "mothership",
    description: "All your work tools on one screen, and agents to hand the work to.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
