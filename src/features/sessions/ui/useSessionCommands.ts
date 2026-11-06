"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useCommands, type Command } from "@/shell/commands/commandContext";
import type { Agent } from "@/features/sessions/model/Agent";
import { openAgentFolderIn } from "@/features/sessions/ui/openAgentFolderIn";
import { stopTurn } from "@/features/sessions/ui/sessionActions";
import { useT } from "@/ui/i18n/useT";

/**
 * ### useSessionCommands
 *
 * Registers the session tab's commands: reply (focuses `composerRef`), stop
 * the running turn, and open the session folder in Terminal or VS Code. They
 * act on the latest `agent` but are registered only once.
 */
export function useSessionCommands(agent: Agent, composerRef: RefObject<HTMLTextAreaElement | null>): void {
  const t = useT();
  // Commands read the latest render through this ref so they register once.
  const latest = useRef(agent);
  useEffect(() => {
    latest.current = agent;
  });
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "session-reply", title: t("sessions.command.reply"), group: "Sessions", keys: ["r"], run: () => composerRef.current?.focus() },
      {
        id: "session-stop",
        title: t("sessions.command.stop"),
        group: "Sessions",
        keys: ["mod+."],
        run: () => {
          if (latest.current.status !== "running") return false;
          stopTurn(latest.current.id, t);
        },
      },
      { id: "session-terminal", title: t("sessions.command.terminal"), group: "Sessions", keys: ["t"], run: () => openAgentFolderIn(latest.current.id, "terminal", t) },
      { id: "session-editor", title: t("sessions.command.editor"), group: "Sessions", keys: ["e"], run: () => openAgentFolderIn(latest.current.id, "vscode", t) },
    ],
    // A ref object is stable, so the commands register again only when the language changes.
    [composerRef, t],
  );
  useCommands(commands);
}
