import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/workbench/AppShell";
import { SCROLLBARS_SCRIPT } from "@/ui/scrollbars";
import { THEME_SCRIPT } from "@/ui/theme";
import { LOCALE_SCRIPT } from "@/ui/i18n/useT";
import { serverPlatform, TRAFFIC_LIGHTS_SCRIPT } from "@/ui/hostPlatform";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "mothership",
  description: "All your work tools on one screen, and agents to hand the work to.",
  // Safari's Add to Dock and iOS read these; Chrome reads `manifest.ts`.
  appleWebApp: { capable: true, title: "mothership", statusBarStyle: "black-translucent" },
};

/**
 * ### RootLayout
 *
 * The page shell every route renders in. It is prerendered dark and in
 * English; the pre-paint scripts apply the saved theme, scrollbars, and
 * language before React hydrates, so the first paint already matches.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-platform={serverPlatform()}
      // The pre-paint scripts may remove `dark`, add `classic-scrollbars` or `data-traffic-lights`, or set `lang` before React hydrates.
      suppressHydrationWarning
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SCROLLBARS_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TRAFFIC_LIGHTS_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
