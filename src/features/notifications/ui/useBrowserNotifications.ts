"use client";

import { useEffect, useRef, useState } from "react";
import { useStoredState } from "@/ui/useStoredState";
import type { Tab } from "@/shell/tabs";
import type { NotificationState } from "@/features/notifications/model/NotificationState";
import type { Agent, LiveUpdate } from "@/features/sessions/model/Agent";

const MUTE_KEY = "mothership.notificationsMuted";


const parseMuted = (raw: string): boolean => raw === "1";
const serializeMuted = (muted: boolean): string => (muted ? "1" : "0");

/**
 * ### useBrowserNotifications
 *
 * Shows a desktop notification when an agent asks a question, or a top-level
 * agent finishes or fails, while this tab is not visible. Sub-agents are left
 * out: their results already go to the agent that created them. Clicking a
 * notification focuses this browser tab and opens the relevant workbench tab.
 *
 * @param openTab - Opens a workbench tab, e.g. `workbench.open`; pass a stable function.
 * @returns The effective state and a toggle (asks for permission the first time).
 */
export function useBrowserNotifications(
  agents: Array<Agent>,
  subscribe: (listener: (update: LiveUpdate) => void) => () => void,
  openTab: (tab: Tab) => void,
): { state: NotificationState; toggle: () => void } {
  const [permission, setPermission] = useState<NotificationState>("unsupported");
  const [muted, setMuted] = useStoredState(MUTE_KEY, false, parseMuted, serializeMuted);
  const lastStatus = useRef(new Map<string, Agent["status"]>());
  const names = useRef(new Map<string, Agent>());

  useEffect(() => {
    // Deferred a tick: reading browser-only APIs must wait until after hydration.
    const timer = setTimeout(() => {
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    names.current = new Map(agents.map((a) => [a.id, a]));
  }, [agents]);

  const enabled = permission === "granted" && !muted;

  useEffect(() => {
    if (!enabled) return;
    function show(title: string, body: string, tag: string, tab: Tab) {
      if (document.visibilityState === "visible") return;
      const notification = new Notification(title, { body: body.slice(0, 200), tag });
      notification.onclick = () => {
        window.focus();
        openTab(tab);
        notification.close();
      };
    }
    return subscribe((update) => {
      if (update.type === "question" && update.question.status === "open") {
        const agent = names.current.get(update.question.agentId);
        show(`Question from ${agent?.name ?? "an agent"}`, update.question.question, `question:${update.question.id}`, {
          kind: "inbox",
          questionId: update.question.id,
        });
      }
      if (update.type === "agent") {
        const { agent } = update;
        const before = lastStatus.current.get(agent.id);
        lastStatus.current.set(agent.id, agent.status);
        if (before !== "running" || agent.status === "running" || agent.parentId !== undefined) return;
        const label = agent.status === "idle" ? "done" : agent.status === "failed" ? "failed" : "stopped";
        show(`${agent.name} ${label}`, agent.statusNote ?? "", `agent:${agent.id}`, { kind: "session", agentId: agent.id });
      }
    });
  }, [enabled, subscribe, openTab]);

  function toggle() {
    if (permission === "default") {
      void Notification.requestPermission().then(setPermission);
      return;
    }
    if (permission !== "granted") return;
    setMuted(!muted);
  }

  return { state: permission === "granted" && muted ? "muted" : permission, toggle };
}
