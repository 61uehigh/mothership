"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, AgentMessage, AgentQuestion, LiveUpdate } from "@/features/sessions/model/Agent";
import type { LiveAgents, LiveListener } from "@/features/sessions/model/LiveAgents";
import { fetchJson } from "@/ui/useJson";

function upsert<T extends { id: string }>(list: Array<T>, item: T): Array<T> {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  return list.map((x, i) => (i === index ? item : x));
}

/**
 * ### useLiveAgents
 *
 * Loads the snapshot, then applies SSE updates. On reconnect it reloads the
 * snapshot, since updates sent while disconnected are lost.
 *
 * @returns The live state; see {@link LiveAgents}.
 */
export function useLiveAgents(): LiveAgents {
  const [agents, setAgents] = useState<Array<Agent>>([]);
  const [messages, setMessages] = useState<Array<AgentMessage>>([]);
  const [questions, setQuestions] = useState<Array<AgentQuestion>>([]);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<LiveListener>());

  useEffect(() => {
    let cancelled = false;
    /** Which snapshot load is the latest; an older one that finishes later is dropped. */
    let snapshotSeq = 0;
    /** Updates that arrive while a snapshot loads; replayed on top of it so none is lost. */
    let buffered: Array<LiveUpdate> | undefined;

    function apply(update: LiveUpdate) {
      if (update.type === "agent") setAgents((list) => upsert(list, update.agent));
      if (update.type === "message") setMessages((list) => upsert(list, update.message));
      if (update.type === "agentDeleted") {
        setAgents((list) => list.filter((a) => a.id !== update.agentId));
        setMessages((list) => list.filter((m) => m.agentId !== update.agentId));
        setQuestions((list) => list.filter((q) => q.agentId !== update.agentId));
      }
      if (update.type === "question") {
        setQuestions((list) => [update.question, ...list.filter((q) => q.id !== update.question.id)]);
      }
    }

    async function loadSnapshot() {
      const seq = ++snapshotSeq;
      buffered = [];
      const result = await fetchJson<{ agents: Array<Agent>; messages: Array<AgentMessage>; questions: Array<AgentQuestion> }>("/api/agents");
      if (cancelled || seq !== snapshotSeq) return;
      const replay = buffered;
      buffered = undefined;
      // A failed load is retried on the next reconnect; the live updates still apply meanwhile.
      if (result.ok) {
        setAgents(result.data.agents);
        setMessages(result.data.messages);
        setQuestions(result.data.questions);
      }
      for (const update of replay) apply(update);
    }

    const source = new EventSource("/api/stream");
    source.onopen = () => {
      setConnected(true);
      void loadSnapshot();
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (event: MessageEvent<string>) => {
      // Trusted: produced by our own /api/stream route.
      const update = JSON.parse(event.data) as LiveUpdate;
      buffered?.push(update);
      apply(update);
      for (const listener of listeners.current) listener(update);
    };
    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  // Stable identity so consumers can list it as an effect dependency.
  const subscribe = useCallback((listener: LiveListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { agents, messages, questions, connected, subscribe };
}
