"use client";

import { LocalFiles } from "@/features/explorer/ui/LocalFiles";

/**
 * ### FilesPane
 *
 * The Explorer: browses folders on this Mac like Finder ({@link LocalFiles}).
 * A session's folder opens here from its details ("Browse").
 */
export function FilesPane() {
  return <LocalFiles />;
}
