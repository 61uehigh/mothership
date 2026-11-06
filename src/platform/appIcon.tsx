import { ImageResponse } from "next/og";

/** The app's background in dark mode, so the installed icon matches the window. */
export const APP_BACKGROUND = "#0c0c0e";

/** The same drawing as `src/app/icon.svg` and `MothershipIcon`, in teal. */
const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7.2a4 4 0 0 1 8 0"/><ellipse cx="12" cy="9" rx="10" ry="3"/><path d="M8 9.5h.01M12 10h.01M16 9.5h.01"/><path d="M8.8 11.9 6 21M15.2 11.9 18 21"/><path d="M9.6 18.6a2.4 2.2 0 0 1 4.8 0M8.6 18.6h6.8"/></svg>`;
const GLYPH_URI = `data:image/svg+xml;base64,${Buffer.from(GLYPH).toString("base64")}`;

/**
 * ### AppIconShape
 *
 * - `rounded`: a rounded square with a margin, as macOS draws app icons;
 *   used where the system shows the icon as is (Chrome's installed apps).
 * - `full`: edge to edge, for systems that mask the icon themselves
 *   (manifest `maskable` icons, Safari's Add to Dock, iOS).
 */
export type AppIconShape = "rounded" | "full";

/**
 * ### appIconResponse
 *
 * Draws the installed-app icon as a PNG: the teal line icon on the app's
 * dark background.
 *
 * @param size - Width and height in pixels.
 * @returns The PNG response.
 */
export function appIconResponse(size: number, shape: AppIconShape): ImageResponse {
  // macOS icons fill about 80% of their canvas; maskable icons keep content in the middle 80%.
  const body = shape === "rounded" ? Math.round(size * 0.8) : size;
  const glyph = Math.round(size * (shape === "rounded" ? 0.5 : 0.56));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: body,
            height: body,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: APP_BACKGROUND,
            borderRadius: shape === "rounded" ? Math.round(body * 0.225) : 0,
          }}
        >
          {/* Satori draws images, not elements; next/image does not apply here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GLYPH_URI} width={glyph} height={glyph} alt="" />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
