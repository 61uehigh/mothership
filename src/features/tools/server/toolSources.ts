import { calendarToolSource } from "@/features/tools/calendar/server/calendarSource";
import { linearToolSource } from "@/features/tools/linear/server/linearSource";
import { nuclinoToolSource } from "@/features/tools/nuclino/server/nuclinoSource";
import { slackToolSource } from "@/features/tools/slack/server/slackSource";
import type { ToolSources } from "@/features/tools/server/ToolSource";

/**
 * ### TOOL_SOURCES
 *
 * Every work tool the dashboard can show. A new tool adds its source here
 * (and its kind to `TOOL_KINDS`); nothing else in the dashboard changes.
 */
export const TOOL_SOURCES: ToolSources = {
  calendar: calendarToolSource,
  linear: linearToolSource,
  slack: slackToolSource,
  nuclino: nuclinoToolSource,
};
