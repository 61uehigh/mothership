"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveMessages, useShell } from "@/shell/shellContext";
import type { AgentEventRecord, AgentMessage } from "@/features/sessions/model/Agent";
import { fetchJson } from "@/ui/useJson";

/**
 * ### SessionConversation
 *
 * One session's messages and events, kept live.
 */
export type SessionConversation = {
  messages: Array<AgentMessage>;
  events: Array<AgentEventRecord>;
  /** A load has succeeded at least once. */
  loaded: boolean;
  /** Why the last load failed; cleared when one succeeds. */
  loadError: string | undefined;
  /** Loads again, e.g. after a failure. */
  retry: () => void;
};

/**
 * ### useSessionConversation
 *
 * A session's messages and events, kept live. Messages are the app's one
 * live message store filtered to this session (it reloads them whole when the
 * connection comes back, so a message removed meanwhile goes away too).
 * Events, which are only ever added, are loaded here and loaded again
 * whenever the connection comes back; what is loaded and what arrived live
 * are merged by id, so none is lost or shown twice.
 */
export function useSessionConversation(agentId: string): SessionConversation {
  const { subscribe, connected } = useShell();
  const everyMessage = useLiveMessages();
  const messages = useMemo(() => everyMessage.filter((m) => m.agentId === agentId), [everyMessage, agentId]);
  const [events, setEvents] = useState<Array<AgentEventRecord>>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  /** Bumped by Retry to load again. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Subscribe before loading so nothing between the fetch and the subscription is lost.
    const unsubscribe = subscribe((update) => {
      if (update.type === "event" && update.record.agentId === agentId) {
        setEvents((list) => (list.some((r) => r.id === update.record.id) ? list : [...list, update.record]));
      }
    });
    // Loaded again whenever the live connection comes back: updates sent while it was down never arrived.
    if (!connected && loaded) return () => unsubscribe();
    void (async () => {
      const result = await fetchJson<{ events: Array<AgentEventRecord> }>(`/api/agents/${agentId}`);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      const data = result.data;
      setLoadError(undefined);
      setEvents((live) => {
        const known = new Set(data.events.map((r) => r.id));
        return [...data.events, ...live.filter((r) => !known.has(r.id))];
      });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `loaded` is read only to skip a pointless load while disconnected; it must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, subscribe, connected, attempt]);

  return { messages, events, loaded, loadError, retry: () => setAttempt((n) => n + 1) };
}
