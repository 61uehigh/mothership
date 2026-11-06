"use client";

import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { Markdown } from "@/shell/Markdown";
import { Chip, TabFrame, type TabFrameState } from "@/shell/tabFrame";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { HandOffButton } from "@/features/tools/ui/toolDoc";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * ### MarkdownDocTab
 *
 * A center tab showing one document from a notes tool (a Nuclino doc, a
 * Notion page) as Markdown: the tool's name and the last edit as chips, a
 * link to open it in the tool, and a hand-off button.
 *
 * @param product - The tool's name, shown as it is.
 * @param doc - The loaded document; `undefined` while it loads.
 * @param fallback - The tab's own title and the tool's link for the id, until it loads.
 * @param text - The open-in link's label and what to say for an empty document.
 * @param onHandOff - `undefined` (disabled) until the document has loaded.
 * @param children - Shown under the body, e.g. a note that the tool cut the document short.
 */
export function MarkdownDocTab({
  product,
  doc,
  fallback,
  text,
  state,
  onHandOff,
  children,
}: {
  product: string;
  doc: { title: string; markdown: string; url: string; updatedAt: number | undefined } | undefined;
  fallback: { title: string; url: string };
  text: { openIn: string; empty: string };
  state: TabFrameState;
  onHandOff: (() => void) | undefined;
  children?: ReactNode;
}) {
  const t = useT();
  const { dateLocale } = useFormat();
  return (
    <TabFrame
      title={itemTitle(t, doc === undefined ? fallback.title : doc.title)}
      chips={
        <>
          <Chip>{product}</Chip>
          {doc?.updatedAt !== undefined && (
            <Chip>
              <Clock size={11} aria-hidden />
              <span className="whitespace-nowrap">{t("tools.updated", { when: new Date(doc.updatedAt).toLocaleString(dateLocale, DATE_FORMAT) })}</span>
            </Chip>
          )}
        </>
      }
      open={{ label: text.openIn, url: doc?.url ?? fallback.url }}
      actions={<HandOffButton onHandOff={onHandOff} />}
      state={state}
    >
      {doc !== undefined && doc.markdown.trim() === "" ? <p className="text-sm text-zinc-500">{text.empty}</p> : <Markdown>{doc?.markdown ?? ""}</Markdown>}
      {children}
    </TabFrame>
  );
}
