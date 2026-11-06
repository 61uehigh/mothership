import type { InboxInputs } from "@/features/inbox/server/buildInbox";
import type { AgentQuestion } from "@/features/sessions/model/Agent";
import type { WidgetResult } from "@/features/tools/model/Dashboard";
import { toError } from "@/lib/errors";

/**
 * ### InboxSources
 *
 * Where each of the Inbox's inputs is loaded from, passed in by the
 * composition root. `refresh` asks each source fresh instead of from the
 * cache the sidebar sections share.
 *
 * @property sessions - The sessions and the questions they asked, as they are now.
 * @property widget - A sidebar widget's result; `undefined` when there is none of that kind.
 * @property linearNotifications - Your Linear inbox; `undefined` when it could not be read.
 * @property github - Your pull requests and their checks; rejects when `gh` fails.
 */
export type InboxSources = {
  sessions: () => { agents: ReadonlyArray<{ id: string; name: string }>; questions: Array<AgentQuestion> };
  widget: (kind: "slack" | "calendar" | "linear", refresh: boolean) => Promise<WidgetResult | undefined>;
  linearNotifications: (refresh: boolean) => Promise<InboxInputs["linearNotifications"]>;
  github: (refresh: boolean) => Promise<Exclude<InboxInputs["github"], Error>>;
  gmail: (refresh: boolean) => Promise<InboxInputs["gmail"]>;
};

/**
 * ### loadInboxInputs
 *
 * Loads every source at once. A GitHub failure comes back as its `Error`,
 * shown as a problem next to the other sources' items.
 */
export async function loadInboxInputs(sources: InboxSources, refresh: boolean): Promise<InboxInputs> {
  const { agents, questions } = sources.sessions();
  const [slack, calendar, linear, linearNotifications, github, gmail] = await Promise.all([
    sources.widget("slack", refresh),
    sources.widget("calendar", refresh),
    sources.widget("linear", refresh),
    sources.linearNotifications(refresh),
    sources.github(refresh).catch(toError),
    sources.gmail(refresh),
  ]);
  return { questions, agentNames: new Map(agents.map((a) => [a.id, a.name])), slack, calendar, linear, linearNotifications, github, gmail };
}
