"use client";

import { useShell } from "@/shell/shellContext";
import type { Tab } from "@/shell/tabs";
import type { NotionPage } from "@/features/tools/model/Tools";
import { notionUrl } from "@/features/tools/model/toolUrls";
import { draftFor } from "@/features/tools/ui/delegation";
import { notionHandOffItem } from "@/features/tools/ui/handOff";
import { MarkdownDocTab } from "@/features/tools/ui/MarkdownDocTab";
import { useToolDocument } from "@/features/tools/ui/toolDoc";
import { useT } from "@/ui/i18n/useT";

/**
 * ### NotionPageTab
 *
 * Center tab showing one Notion page, read through `GET /api/tools/notion/page`.
 */
export function NotionPageTab({ tab }: { tab: Extract<Tab, { kind: "notion" }> }) {
  const t = useT();
  const { openNewAgent } = useShell();
  const state = useToolDocument<NotionPage>(`/api/tools/notion/page?id=${encodeURIComponent(tab.pageId)}`, "notion");
  const page = state.data;
  return (
    <MarkdownDocTab
      product="Notion"
      doc={page}
      fallback={{ title: tab.title, url: notionUrl(tab.pageId) }}
      text={{ openIn: t("notion.openIn"), empty: t("notion.emptyPage") }}
      state={state}
      onHandOff={page === undefined ? undefined : () => openNewAgent(draftFor("notion", notionHandOffItem(page)))}
    >
      {page?.truncated === true && <p className="mt-4 text-xs text-zinc-500">{t("notion.truncated")}</p>}
    </MarkdownDocTab>
  );
}
