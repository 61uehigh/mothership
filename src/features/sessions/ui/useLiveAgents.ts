"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, AgentMessage, AgentQuestion, LiveUpdate } from "@/features/sessions/model/Agent";
import type { LiveAgents, LiveListener, MessageStore } from "@/features/sessions/model/LiveAgents";
import { fetchJson } from "@/ui/useJson";

function upsert<T extends { id: string }>(list: Array<T>, item: T): Array<T> {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  return list.map((x, i) => (i === index ? item : x));
}

/** A {@link MessageStore} that `update` changes and tells its subscribers about. */
function createMessageStore(): MessageStore & { update: (change: (list: Array<AgentMessage>) => Array<AgentMessage>) => void } {
  let messages: Array<AgentMessage> = [];
  const subscribers = new Set<() => void>();
  return {
    get: () => messages,
    subscribe: (onChange) => {
      subscribers.add(onChange);
      return () => subscribers.delete(onChange);
    },
    update: (change) => {
      messages = change(messages);
      for (const onChange of subscribers) onChange();
    },
  };
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
  // Not React state: a new message must not re-render whoever holds this hook, only the store's readers.
  const [messages] = useState(createMessageStore);
  const setMessages = messages.update;
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
        setMessages(() => result.data.messages);
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
  }, [setMessages]);

  // Stable identity so consumers can list it as an effect dependency.
  const subscribe = useCallback((listener: LiveListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  // One object per change, so the shell built from it is not rebuilt on every render.
  return useMemo(() => ({ agents, messages, questions, connected, subscribe }), [agents, messages, questions, connected, subscribe]);
}
