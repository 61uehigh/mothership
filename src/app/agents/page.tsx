"use client";

import { Suspense } from "react";
import { RouteIntent } from "@/workbench/RouteIntent";
import type { Tab } from "@/shell/tabs";

const toTab = (params: URLSearchParams): Tab => {
  const agentId = params.get("agent");
  if (agentId === null) return { kind: "graph" };
  return params.get("tab") === "changes" ? { kind: "changes", agentId } : { kind: "session", agentId };
};

/**
 * ### AgentsPage
 *
 * `/agents?agent=&tab=`: opens the session (or its changes) in a tab.
 */
export default function AgentsPage() {
  return (
    <Suspense>
      <RouteIntent toTab={toTab} />
    </Suspense>
  );
}
