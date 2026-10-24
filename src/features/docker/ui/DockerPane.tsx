"use client";

import { RefreshCw, X } from "lucide-react";
import { useContext, useMemo, type ReactNode } from "react";
import { ACTION_LABEL, ActionIcon } from "@/features/docker/ui/actionIcons";
import { STATE_DOT, actionsFor, useContainerActions, useContainers } from "@/features/docker/ui/api";
import { RefreshButton, ROW_ACTION } from "@/ui/IconButton";
import { Message } from "@/ui/Message";
import { usePageVisible } from "@/ui/usePageVisible";
import { PaneHeader, StackedSectionContext } from "@/shell/PaneHeader";
import type { Tab } from "@/shell/tabs";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { ContainerSummary } from "@/features/docker/model/Docker";

const POLL_MS = 10_000;
const STANDALONE = "Standalone";

function byRunningThenName(a: ContainerSummary, b: ContainerSummary): number {
  const running = Number(b.state === "running") - Number(a.state === "running");
  return running !== 0 ? running : a.name.localeCompare(b.name);
}

/**
 * ### DockerPane
 *
 * Sidebar list of local Docker containers, grouped by Compose project
 * (others under "Standalone"), running containers first. Hovering a row
 * offers start, stop, or restart; a click previews the container in a tab
 * and a double click pins it. Refreshes every 10 seconds while shown:
 * polling pauses while its section is folded or the browser tab is hidden.
 */
export function DockerPane() {
  const workbench = useWorkbench();
  const folded = useContext(StackedSectionContext)?.collapsed === true;
  const visible = usePageVisible();
  const { data, failure, loading, reload } = useContainers(folded || !visible ? undefined : POLL_MS);
  const actions = useContainerActions(reload);
  const activeId = workbench.active?.tab.kind === "container" ? workbench.active.tab.id : undefined;

  const groups = useMemo(() => {
    if (data === undefined) return [];
    const byProject = new Map<string, Array<ContainerSummary>>();
    for (const container of data.containers) {
      const key = container.project ?? STANDALONE;
      byProject.set(key, [...(byProject.get(key) ?? []), container]);
    }
    return [...byProject]
      .map(([project, containers]) => [project, containers.sort(byRunningThenName)] as const)
      .sort(([a], [b]) => (a === STANDALONE ? 1 : b === STANDALONE ? -1 : a.localeCompare(b)));
  }, [data]);

  function row(container: ContainerSummary) {
    const selected = container.id === activeId;
    const confirming = actions.confirming === container.id;
    const busy = actions.busy === container.id;
    const tab: Tab = { kind: "container", id: container.id, name: container.name };
    return (
      <li key={container.id} className="group relative">
        <span
          className={`absolute right-1 top-1 z-10 gap-0.5 rounded bg-zinc-100 dark:bg-zinc-900 ${confirming || busy ? "flex" : "hidden group-hover:flex group-focus-within:flex"}`}
        >
          {confirming ? (
            <>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950"
                onClick={() => actions.request(container.id, "stop")}
              >
                Stop?
              </button>
              <button type="button" aria-label="Cancel" title="Cancel" className={ROW_ACTION} onClick={actions.cancel}>
                <X size={13} />
              </button>
            </>
          ) : busy ? (
            <span className={ROW_ACTION}>
              <RefreshCw size={13} className="animate-spin" aria-hidden />
              <span className="sr-only">Working</span>
            </span>
          ) : (
            actionsFor(container.state).map((action) => (
              <button
                key={action}
                type="button"
                aria-label={ACTION_LABEL[action]}
                title={ACTION_LABEL[action]}
                disabled={actions.busy !== undefined}
                className={ROW_ACTION}
                onClick={() => actions.request(container.id, action)}
              >
                <ActionIcon action={action} size={13} />
              </button>
            ))
          )}
        </span>
        <button
          type="button"
          title={`${container.name} · ${container.image}`}
          onClick={() => workbench.open(tab, { preview: true })}
          onDoubleClick={() => workbench.open(tab)}
          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
            selected ? "bg-teal-100/70 dark:bg-teal-900/40" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
          }`}
        >
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATE_DOT[container.state]}`} aria-hidden />
          <span className="sr-only">{container.state}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[13px]">{container.name}</span>
              {container.ports.length > 0 && (
                <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-zinc-500" title={container.ports.join(", ")}>
                  {container.ports[0]}
                  {container.ports.length > 1 ? ` +${container.ports.length - 1}` : ""}
                </span>
              )}
            </span>
            <span className="truncate text-[11px] text-zinc-500">
              {container.image} · {container.status}
            </span>
          </span>
        </button>
      </li>
    );
  }

  let body: ReactNode;
  if (failure !== undefined) {
    // Docker missing or its daemon down is a state to explain, not an error.
    body = <Message tone={failure.code === "failed" || failure.code === undefined ? "error" : "muted"}>{failure.error}</Message>;
  } else if (data === undefined) {
    body = <Message>Loading containers…</Message>;
  } else if (groups.length === 0) {
    body = <Message>No containers. Containers you create with Docker or Docker Compose show up here.</Message>;
  } else {
    body = groups.map(([project, containers]) => (
      <section key={project} className="mb-2">
        <h4 className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500">
          <span className="truncate">{project}</span>
          <span className="ml-auto shrink-0 text-[10px]">
            {containers.filter((c) => c.state === "running").length}/{containers.length}
          </span>
        </h4>
        <ul>{containers.map(row)}</ul>
      </section>
    ));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Docker">
        <RefreshButton loading={loading} onClick={reload} />
      </PaneHeader>
      {actions.error !== undefined && (
        <div className="mx-2 mb-2 flex items-start gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
          <span className="min-w-0 flex-1 break-words">{actions.error.message}</span>
          <button type="button" aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900" onClick={actions.clearError}>
            <X size={12} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">{body}</div>
    </div>
  );
}
