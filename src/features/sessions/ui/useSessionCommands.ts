"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import type { Agent } from "@/features/sessions/model/Agent";
import { openIn } from "@/features/sessions/ui/openIn";
import { stopTurn } from "@/features/sessions/ui/sessionActions";

/**
 * ### useSessionCommands
 *
 * Registers the session tab's commands: reply (focuses `composerRef`), stop
 * the running turn, and open the session folder in Terminal or VS Code. They
 * act on the latest `agent` but are registered only once.
 */
export function useSessionCommands(agent: Agent, composerRef: RefObject<HTMLTextAreaElement | null>): void {
  // Commands read the latest render through this ref so they register once.
  const latest = useRef(agent);
  useEffect(() => {
    latest.current = agent;
  });
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "session-reply", title: "Write to this session", group: "Session", keys: ["r"], run: () => composerRef.current?.focus() },
      {
        id: "session-stop",
        title: "Stop the running turn",
        group: "Session",
        keys: ["mod+."],
        run: () => {
          if (latest.current.status !== "running") return false;
          stopTurn(latest.current.id);
        },
      },
      { id: "session-terminal", title: "Open the session folder in Terminal", group: "Session", keys: ["t"], run: () => openIn(latest.current.id, "terminal") },
      { id: "session-editor", title: "Open the session folder in VS Code", group: "Session", keys: ["e"], run: () => openIn(latest.current.id, "vscode") },
    ],
    // A ref object is stable, so the commands still register once.
    [composerRef],
  );
  useCommands(commands);
}
