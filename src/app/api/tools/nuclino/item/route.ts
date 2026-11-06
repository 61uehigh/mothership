import { z } from "zod";
import { parseQuery, respondWith } from "@/app/api/_lib/http";
import { fetchNuclinoDoc } from "@/features/tools/nuclino/server/nuclinoDoc";
import { getDashboard } from "@/composition/server";
import { highlightNames } from "@/features/tools/server/sourceUtils";

const querySchema = z.object({ id: z.uuid({ error: "id must be a Nuclino item UUID" }) });

/**
 * ### GET
 *
 * Reads one Nuclino doc through the source of the `nuclino` dashboard widget.
 * `?id=` is the item UUID.
 *
 * @returns A `NuclinoDoc`; 400 for a bad id, 404 when Nuclino has no such
 *   item, 409 when Nuclino is not set up, 502 when the call fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const { id } = query;
  const dashboard = getDashboard();
  const names = await dashboard.myNames();
  const outcome = await dashboard.callTool("nuclino", async (caller) => {
    const doc = await fetchNuclinoDoc(caller, id);
    return { ...doc, markdown: highlightNames(doc.markdown, names) };
  });
  return respondWith(outcome, `Nuclino doc ${id}`);
}
