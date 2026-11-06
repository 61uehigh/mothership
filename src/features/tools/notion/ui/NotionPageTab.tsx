"use client";

import { Clock } from "lucide-react";
import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { notionHandOffItem } from "@/features/tools/ui/handOff";
import { Markdown } from "@/shell/Markdown";
import { HandOffButton, useToolDocument } from "@/features/tools/ui/toolDoc";
import { Chip, TabFrame } from "@/shell/TabFrame";
import type { NotionPage } from "@/features/tools/model/Tools";
import type { Tab } from "@/shell/tabs";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * ### NotionPageTab
 *
 * Center tab showing one Notion page, read through `GET /api/tools/notion/page`.
 */
export function NotionPageTab({ tab }: { tab: Extract<Tab, { kind: "notion" }> }) {
  const { openNewAgent } = useShell();
  const state = useToolDocument<NotionPage>(`/api/tools/notion/page?id=${encodeURIComponent(tab.pageId)}`);
  const page = state.data;

  return (
    <TabFrame
      title={page?.title ?? tab.title}
      chips={
        <>
          <Chip>Notion</Chip>
          {page?.updatedAt !== undefined && (
            <Chip>
              <Clock size={11} aria-hidden />
              Updated {new Date(page.updatedAt).toLocaleString(undefined, DATE_FORMAT)}
            </Chip>
          )}
        </>
      }
      open={{ label: "Open in Notion", url: page?.url ?? `https://www.notion.so/${tab.pageId.replace(/-/g, "")}` }}
      actions={<HandOffButton onHandOff={page === undefined ? undefined : () => openNewAgent(draftFor("notion", notionHandOffItem(page)))} />}
      state={state}
    >
      {page !== undefined && page.markdown.trim() === "" ? (
        <p className="text-sm text-zinc-500">This page is empty.</p>
      ) : (
        <Markdown>{page?.markdown ?? ""}</Markdown>
      )}
      {page?.truncated === true && <p className="mt-4 text-xs text-zinc-500">Notion left the rest of this long page out; open it in Notion to read all of it.</p>}
    </TabFrame>
  );
}
