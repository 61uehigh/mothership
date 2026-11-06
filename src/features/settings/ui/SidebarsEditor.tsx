"use client";

import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import { useState, type DragEvent } from "react";
import { formatBinding } from "@/shell/commands/keys";
import { DEFAULT_SIDEBARS, dropSection, moveSection as move, SECTION_DRAG_TYPE as DRAG_TYPE, SECTION_INFO, sectionTitle, type SectionPlace as Place, type Sidebars } from "@/shell/sections";
import { isSectionId, SECTIONS, type SectionId } from "@/shell/tabs";
import { useWorkbench } from "@/shell/workbenchContext";
import { useLocale, useT } from "@/ui/i18n/useT";
import { useJson } from "@/ui/useJson";
import type { WidgetInfo } from "@/features/tools/model/Dashboard";

const ICON_BUTTON =
  "rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

function Column({
  title,
  place,
  sections,
  sidebars,
  widgetTitles,
  onChange,
}: {
  title: string;
  place: Place;
  sections: Array<SectionId>;
  sidebars: Sidebars;
  /** The title of each tool section's widget in `config/dashboard.yaml` (e.g. "Today" for Calendar), named as its header names it. */
  widgetTitles: ReadonlyMap<string, string>;
  onChange: (next: Sidebars) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [dropIndex, setDropIndex] = useState<number | undefined>(undefined);

  function drop(event: DragEvent, index: number | undefined) {
    const section = event.dataTransfer.getData(DRAG_TYPE);
    setDropIndex(undefined);
    if (!isSectionId(section)) return;
    event.preventDefault();
    onChange(dropSection(sidebars, section as SectionId, place, index));
  }

  const allowDrop = (event: DragEvent, index: number | undefined) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(index ?? sections.length);
  };

  return (
    <section
      aria-label={title}
      onDragOver={(e) => allowDrop(e, undefined)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(undefined);
      }}
      onDrop={(e) => drop(e, undefined)}
      className="flex min-h-40 flex-col gap-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
    >
      <h3 className="px-1 pb-1 text-xs font-medium text-zinc-500">{title}</h3>
      {sections.length === 0 && (
        <p className="px-1 text-[11px] text-zinc-500">{place === "hidden" ? t("settings.sidebars.allShown") : t("settings.sidebars.empty")}</p>
      )}
      <ul className="flex flex-col gap-0.5">
        {sections.map((section, i) => {
          const { icon: Icon } = SECTION_INFO[section];
          const label = sectionTitle(locale, t, section, widgetTitles.get(section));
          return (
            <li
              key={section}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, section);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.stopPropagation();
                allowDrop(e, i);
              }}
              onDrop={(e) => {
                e.stopPropagation();
                drop(e, i);
              }}
              className={`group flex cursor-grab items-center gap-1.5 rounded-md border px-1.5 py-1 text-[13px] active:cursor-grabbing ${
                dropIndex === i ? "border-teal-500" : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
              }`}
            >
              <GripVertical size={13} aria-hidden className="shrink-0 text-zinc-400" />
              <Icon size={14} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {place === "hidden" ? (
                <>
                  <button type="button" className={`${ICON_BUTTON} text-xs`} onClick={() => onChange(move(sidebars, section, "left"))}>
                    {t("settings.sidebars.left")}
                  </button>
                  <button type="button" className={`${ICON_BUTTON} text-xs`} onClick={() => onChange(move(sidebars, section, "right"))}>
                    {t("settings.sidebars.right")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" aria-label={t("settings.sidebars.moveUpNamed", { label })} title={t("settings.sidebars.moveUp")} disabled={i === 0} className={ICON_BUTTON} onClick={() => onChange(move(sidebars, section, place, i - 1))}>
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("settings.sidebars.moveDownNamed", { label })}
                    title={t("settings.sidebars.moveDown")}
                    disabled={i === sections.length - 1}
                    className={ICON_BUTTON}
                    onClick={() => onChange(move(sidebars, section, place, i + 1))}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={place === "left" ? t("settings.sidebars.toRightNamed", { label }) : t("settings.sidebars.toLeftNamed", { label })}
                    title={place === "left" ? t("settings.sidebars.toRight") : t("settings.sidebars.toLeft")}
                    className={ICON_BUTTON}
                    onClick={() => onChange(move(sidebars, section, place === "left" ? "right" : "left"))}
                  >
                    {place === "left" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                  </button>
                  <button type="button" aria-label={t("settings.sidebars.hideNamed", { label })} title={t("settings.sidebars.hide")} className={ICON_BUTTON} onClick={() => onChange(move(sidebars, section, "hidden"))}>
                    <EyeOff size={13} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {dropIndex === sections.length && <div aria-hidden className="mx-1 h-0.5 rounded bg-teal-500" />}
    </section>
  );
}

/**
 * ### SidebarsEditor
 *
 * Chooses which sections each sidebar shows and in what order: drag them
 * between the lists, or use the buttons on each row. Changes apply at once
 * and are remembered in this browser (or the desktop app).
 */
export function SidebarsEditor() {
  const t = useT();
  const workbench = useWorkbench();
  const { sidebars } = workbench;
  const hidden = SECTIONS.filter((s) => !sidebars.left.includes(s) && !sidebars.right.includes(s));
  const isDefault = JSON.stringify(sidebars) === JSON.stringify(DEFAULT_SIDEBARS);
  // Tool sections are named after their dashboard widget in English; name them the same way here.
  const widgets = useJson<{ widgets: Array<WidgetInfo> }>("/api/dashboard", { remember: true });
  const widgetTitles = new Map<string, string>();
  for (const widget of widgets.data?.widgets ?? []) if (!widgetTitles.has(widget.kind)) widgetTitles.set(widget.kind, widget.title);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
        <Column title={t("settings.sidebars.leftSidebar")} place="left" sections={sidebars.left} sidebars={sidebars} widgetTitles={widgetTitles} onChange={workbench.setSidebars} />
        <Column title={t("settings.sidebars.rightSidebar")} place="right" sections={sidebars.right} sidebars={sidebars} widgetTitles={widgetTitles} onChange={workbench.setSidebars} />
        <Column title={t("settings.sidebars.notShown")} place="hidden" sections={hidden} sidebars={sidebars} widgetTitles={widgetTitles} onChange={workbench.setSidebars} />
      </div>
      <p className="text-[11px] text-zinc-500">{t("settings.sidebars.note", { key: formatBinding("mod+p") })}</p>
      <button
        type="button"
        disabled={isDefault}
        onClick={() => workbench.setSidebars(DEFAULT_SIDEBARS)}
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <RotateCcw size={12} aria-hidden /> {t("settings.sidebars.reset")}
      </button>
    </div>
  );
}
