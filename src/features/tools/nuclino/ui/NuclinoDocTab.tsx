"use client";

import { useShell } from "@/shell/shellContext";
import type { Tab } from "@/shell/tabs";
import type { NuclinoDoc } from "@/features/tools/model/Tools";
import { nuclinoUrl } from "@/features/tools/model/toolUrls";
import { draftFor } from "@/features/tools/ui/delegation";
import { nuclinoHandOffItem } from "@/features/tools/ui/handOff";
import { MarkdownDocTab } from "@/features/tools/ui/MarkdownDocTab";
import { useToolDocument } from "@/features/tools/ui/toolDoc";
import { useT } from "@/ui/i18n/useT";

/**
 * ### NuclinoDocTab
 *
 * Center tab showing one Nuclino doc, read through `GET /api/tools/nuclino/item`.
 */
export function NuclinoDocTab({ tab }: { tab: Extract<Tab, { kind: "doc" }> }) {
  const t = useT();
  const { openNewAgent } = useShell();
  const state = useToolDocument<NuclinoDoc>(`/api/tools/nuclino/item?id=${encodeURIComponent(tab.itemId)}`, "nuclino");
  const doc = state.data;
  return (
    <MarkdownDocTab
      product="Nuclino"
      doc={doc}
      fallback={{ title: tab.title, url: nuclinoUrl(tab.itemId) }}
      text={{ openIn: t("nuclino.openIn"), empty: t("nuclino.emptyDoc") }}
      state={state}
      onHandOff={doc === undefined ? undefined : () => openNewAgent(draftFor("nuclino", nuclinoHandOffItem(doc)))}
    />
  );
}
