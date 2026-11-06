import { appIconResponse } from "@/platform/appIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * ### AppleIcon
 *
 * The icon Safari uses for Add to Dock (and iOS for the Home Screen); it
 * rounds the corners itself, so the drawing goes edge to edge.
 */
export default function AppleIcon() {
  return appIconResponse(size.width, "full");
}
