"use client";

import { Suspense } from "react";
import { RouteIntent } from "@/workbench/RouteIntent";
import type { Tab } from "@/shell/tabs";

const toTab = (params: URLSearchParams): Tab => ({ kind: "inbox", questionId: params.get("q") ?? undefined });

/**
 * ### InboxPage
 *
 * `/inbox?q=`: opens the Inbox tab focused on a question.
 */
export default function InboxPage() {
  return (
    <Suspense>
      <RouteIntent toTab={toTab} />
    </Suspense>
  );
}
