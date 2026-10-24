"use client";

import { Clock } from "lucide-react";
import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { nuclinoHandOffItem } from "@/features/tools/ui/handOff";
import { Markdown } from "@/shell/Markdown";
import { HandOffButton, useToolDocument } from "@/features/tools/ui/toolDoc";
import { Chip, TabFrame } from "@/shell/TabFrame";
import type { NuclinoDoc } from "@/features/tools/model/Tools";
import type { Tab } from "@/shell/tabs";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * ### DocTab
 *
 * Center tab showing one Nuclino doc, read through `GET /api/tools/nuclino/item`.
 */
export function DocTab({ tab }: { tab: Extract<Tab, { kind: "doc" }> }) {
  const { openNewAgent } = useShell();
  const state = useToolDocument<NuclinoDoc>(`/api/tools/nuclino/item?id=${encodeURIComponent(tab.itemId)}`);
  const doc = state.data;

  return (
    <TabFrame
      title={doc?.title ?? tab.title}
      chips={
        <>
          <Chip>Nuclino</Chip>
          {doc?.updatedAt !== undefined && (
            <Chip>
              <Clock size={11} aria-hidden />
              Updated {new Date(doc.updatedAt).toLocaleString(undefined, DATE_FORMAT)}
            </Chip>
          )}
        </>
      }
      open={{ label: "Open in Nuclino", url: doc?.url ?? `https://app.nuclino.com/t/b/${tab.itemId}` }}
      actions={<HandOffButton onHandOff={doc === undefined ? undefined : () => openNewAgent(draftFor("nuclino", nuclinoHandOffItem(doc)))} />}
      state={state}
    >
      {doc !== undefined && doc.markdown.trim() === "" ? (
        <p className="text-sm text-zinc-500">This doc is empty.</p>
      ) : (
        <Markdown>{doc?.markdown ?? ""}</Markdown>
      )}
    </TabFrame>
  );
}
