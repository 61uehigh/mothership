import { appIconResponse, type AppIconShape } from "@/platform/appIcon";

/** Icons the web app manifest lists, by URL name. */
const ICONS: Record<string, { size: number; shape: AppIconShape }> = {
  "192": { size: 192, shape: "rounded" },
  "512": { size: 512, shape: "rounded" },
  maskable: { size: 512, shape: "full" },
  // The desktop app's icon (electron/resources/icon.png is made from it).
  "1024": { size: 1024, shape: "rounded" },
};

/**
 * ### generateStaticParams
 *
 * Every icon is drawn once at build time.
 */
export function generateStaticParams(): Array<{ name: string }> {
  return Object.keys(ICONS).map((name) => ({ name }));
}

/**
 * ### GET
 *
 * @returns The installed-app icon as a PNG, or 404 for an unknown name.
 */
export async function GET(_request: Request, { params }: RouteContext<"/app-icon/[name]">): Promise<Response> {
  const icon = ICONS[(await params).name];
  if (icon === undefined) return new Response("Not found", { status: 404 });
  return appIconResponse(icon.size, icon.shape);
}
