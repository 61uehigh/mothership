import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getDashboard, getTodos } from "@/composition/server";
import { myChannelPosts } from "@/features/tools/slack/server/myChannelPosts";
import { scrumImportSchema } from "@/features/todos/model/ScrumImport";
import { importScrumPosts } from "@/features/todos/server/scrumImport";

/**
 * ### POST
 *
 * Imports what your Daily Scrum posts in Slack channel `channel` report as
 * done, as checked-off to-dos dated to the day of the work. `dryRun` (the
 * default) only shows what would be added. Importing again skips bullets
 * already imported.
 *
 * @returns `ScrumImportResult`; 409 when Slack is not set up, 502 when it fails.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, scrumImportSchema);
  if (body instanceof Response) return body;
  try {
    return Response.json(await importScrumPosts({ posts: () => myChannelPosts(getDashboard(), body.channel, body.userId, "daily scrum import"), store: getTodos(), dryRun: body.dryRun, now: Date.now() }));
  } catch (error) {
    return errorResponse(error);
  }
}
