"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Tab } from "@/shell/tabs";

/**
 * ### RouteIntent
 *
 * Turns an old-style URL (from notifications or links) into a
 * workbench tab, then returns the address bar to `/`.
 *
 * @param toTab - Maps the URL's query parameters to the tab to open.
 */
export function RouteIntent({ toTab }: { toTab: (params: URLSearchParams) => Tab }) {
  const params = useSearchParams();
  const router = useRouter();
  const { open } = useWorkbench();

  useEffect(() => {
    open(toTab(new URLSearchParams(params.toString())));
    router.replace("/");
    // Runs once per navigation; `toTab` is a stable module-level mapping in each page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return undefined;
}
