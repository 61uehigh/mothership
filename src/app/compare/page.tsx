"use client";

import { Suspense } from "react";
import { RouteIntent } from "@/workbench/RouteIntent";
import type { Tab } from "@/shell/tabs";

const toTab = (params: URLSearchParams): Tab => ({ kind: "compare", group: params.get("group") ?? "" });

/**
 * ### ComparePage
 *
 * `/compare?group=`: opens the comparison in a tab.
 */
export default function ComparePage() {
  return (
    <Suspense>
      <RouteIntent toTab={toTab} />
    </Suspense>
  );
}
