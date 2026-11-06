"use client";

import { ChevronRight, Folder, Plus, X } from "lucide-react";
import { useState } from "react";
import { useJson } from "@/ui/useJson";
import type { MeetingCollection, NuclinoCollectionChoice } from "@/features/meetings/model/Meetings";

type Choice = NuclinoCollectionChoice & { kind: "workspace" | "collection" };

const BUTTON = "inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** One workspace or collection, unfolding to the collections inside it. */
function Node({ choice, chosen, onAdd }: { choice: Choice; chosen: Set<string>; onAdd: (collection: MeetingCollection) => void }) {
  const [open, setOpen] = useState(false);
  const path = [...choice.path, choice.title];
  const children = useJson<Array<Choice>>(open ? `/api/meetings/collections?parent=${choice.id}&path=${encodeURIComponent(path.join(" / "))}` : undefined);
  return (
    <li>
      <div className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/70">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13px]">
          <ChevronRight size={12} className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
          <Folder size={12} className="shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate">{choice.title}</span>
          {choice.kind === "workspace" && <span className="shrink-0 text-[11px] text-zinc-500">workspace</span>}
        </button>
        {choice.kind === "collection" && (
          <button
            type="button"
            className={BUTTON}
            disabled={chosen.has(choice.id)}
            onClick={() => onAdd({ id: choice.id, title: choice.path.length > 1 ? `${choice.path.slice(1).join(" / ")} / ${choice.title}` : choice.title, workspace: choice.workspace })}
          >
            <Plus size={11} aria-hidden />
            {chosen.has(choice.id) ? "Added" : "Add"}
          </button>
        )}
      </div>
      {open && (
        <div className="pl-4">
          {children.data === undefined ? (
            <p className="px-1 py-0.5 text-[11px] text-zinc-500">{children.error ?? "Reading…"}</p>
          ) : children.data.length === 0 ? (
            <p className="px-1 py-0.5 text-[11px] text-zinc-500">No collections inside.</p>
          ) : (
            <ul>
              {children.data.map((child) => (
                <Node key={child.id} choice={child} chosen={chosen} onAdd={onAdd} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * ### MeetingCollectionsEditor
 *
 * Settings → Meetings: the Nuclino collections your meeting notes are in.
 * Browse workspaces and collections, add the ones to list; each change
 * saves at once.
 *
 * @param onSave - Saves the whole list; resolves with an error message, if any.
 */
export function MeetingCollectionsEditor({ collections, onSave }: { collections: Array<MeetingCollection>; onSave: (collections: Array<MeetingCollection>) => Promise<string | undefined> }) {
  const [status, setStatus] = useState<{ message: string; failed: boolean } | undefined>(undefined);
  const [browsing, setBrowsing] = useState(collections.length === 0);
  const roots = useJson<Array<Choice>>(browsing ? "/api/meetings/collections" : undefined);
  const chosen = new Set(collections.map((c) => c.id));

  async function save(next: Array<MeetingCollection>) {
    const error = await onSave(next);
    setStatus({ message: error ?? "Saved", failed: error !== undefined });
  }

  return (
    <div className="flex flex-col gap-3">
      {collections.length === 0 ? (
        <p className="text-xs text-zinc-500">No collections yet. The Meetings section stays empty until you add one.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {collections.map((collection) => (
            <li key={collection.id} className="flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-1 text-[13px] dark:border-zinc-800">
              <span className="min-w-0 flex-1 truncate">{collection.title}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">{collection.workspace}</span>
              <button
                type="button"
                aria-label={`Remove ${collection.title}`}
                onClick={() => void save(collections.filter((c) => c.id !== collection.id))}
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {browsing ? (
        <div className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium text-zinc-500">Nuclino</span>
            <button type="button" className={BUTTON} onClick={() => setBrowsing(false)}>
              Done
            </button>
          </div>
          {roots.data === undefined ? (
            <p className="px-1 text-[11px] text-zinc-500">{roots.error ?? "Reading your workspaces…"}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {roots.data.map((root) => (
                <Node key={root.id} choice={root} chosen={chosen} onAdd={(collection) => void save([...collections, collection])} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <button type="button" className={BUTTON} onClick={() => setBrowsing(true)}>
            <Plus size={11} aria-hidden />
            Add a collection
          </button>
        </div>
      )}
      {status !== undefined && <p className={`text-[11px] ${status.failed ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>{status.message}</p>}
    </div>
  );
}
