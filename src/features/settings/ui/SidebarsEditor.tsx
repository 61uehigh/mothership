"use client";

import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import { useState, type DragEvent } from "react";
import { DEFAULT_SIDEBARS, SECTION_INFO, type Sidebars } from "@/shell/sections";
import { SECTIONS, type SectionId } from "@/shell/tabs";
import { useWorkbench } from "@/shell/WorkbenchContext";

type Place = "left" | "right" | "hidden";

const ICON_BUTTON =
  "rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const DRAG_TYPE = "application/x-mothership-section";

/**
 * Moves `section` to `place`, before the section at `index` (or to the end),
 * taking it out of wherever it was.
 */
function move(sidebars: Sidebars, section: SectionId, place: Place, index?: number): Sidebars {
  const left = sidebars.left.filter((s) => s !== section);
  const right = sidebars.right.filter((s) => s !== section);
  if (place === "hidden") return { left, right };
  const list = place === "left" ? left : right;
  list.splice(index === undefined ? list.length : Math.min(index, list.length), 0, section);
  return { left, right };
}

function Column({
  title,
  place,
  sections,
  sidebars,
  onChange,
}: {
  title: string;
  place: Place;
  sections: Array<SectionId>;
  sidebars: Sidebars;
  onChange: (next: Sidebars) => void;
}) {
  const [dropIndex, setDropIndex] = useState<number | undefined>(undefined);

  function drop(event: DragEvent, index: number | undefined) {
    const section = event.dataTransfer.getData(DRAG_TYPE);
    setDropIndex(undefined);
    if (!(SECTIONS as ReadonlyArray<string>).includes(section)) return;
    event.preventDefault();
    // Dropping lower in the same list counts positions before the dragged row moved out.
    const from = sections.indexOf(section as SectionId);
    const at = index !== undefined && from !== -1 && from < index ? index - 1 : index;
    onChange(move(sidebars, section as SectionId, place, at));
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
        <p className="px-1 text-[11px] text-zinc-500">{place === "hidden" ? "Every section is in a sidebar." : "Empty: this sidebar is hidden."}</p>
      )}
      <ul className="flex flex-col gap-0.5">
        {sections.map((section, i) => {
          const { icon: Icon, label } = SECTION_INFO[section];
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
                    Left
                  </button>
                  <button type="button" className={`${ICON_BUTTON} text-xs`} onClick={() => onChange(move(sidebars, section, "right"))}>
                    Right
                  </button>
                </>
              ) : (
                <>
                  <button type="button" aria-label={`Move ${label} up`} title="Move up" disabled={i === 0} className={ICON_BUTTON} onClick={() => onChange(move(sidebars, section, place, i - 1))}>
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} down`}
                    title="Move down"
                    disabled={i === sections.length - 1}
                    className={ICON_BUTTON}
                    onClick={() => onChange(move(sidebars, section, place, i + 1))}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} to the ${place === "left" ? "right" : "left"} sidebar`}
                    title={`Move to the ${place === "left" ? "right" : "left"} sidebar`}
                    className={ICON_BUTTON}
                    onClick={() => onChange(move(sidebars, section, place === "left" ? "right" : "left"))}
                  >
                    {place === "left" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                  </button>
                  <button type="button" aria-label={`Hide ${label}`} title="Don't show in a sidebar" className={ICON_BUTTON} onClick={() => onChange(move(sidebars, section, "hidden"))}>
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
  const workbench = useWorkbench();
  const { sidebars } = workbench;
  const hidden = SECTIONS.filter((s) => !sidebars.left.includes(s) && !sidebars.right.includes(s));
  const isDefault = JSON.stringify(sidebars) === JSON.stringify(DEFAULT_SIDEBARS);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 @2xl:grid-cols-3">
        <Column title="Left sidebar" place="left" sections={sidebars.left} sidebars={sidebars} onChange={workbench.setSidebars} />
        <Column title="Right sidebar" place="right" sections={sidebars.right} sidebars={sidebars} onChange={workbench.setSidebars} />
        <Column title="Not shown" place="hidden" sections={hidden} sidebars={sidebars} onChange={workbench.setSidebars} />
      </div>
      <p className="text-[11px] text-zinc-500">A section that isn&apos;t shown still opens full size from the command center (⌘P).</p>
      <button
        type="button"
        disabled={isDefault}
        onClick={() => workbench.setSidebars(DEFAULT_SIDEBARS)}
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <RotateCcw size={12} aria-hidden /> Reset to default
      </button>
    </div>
  );
}
