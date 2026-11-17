import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { getGmail } from "@/composition/server";
import { MAIL_FILTERS, type MailFilter } from "@/features/gmail/model/Gmail";

/**
 * ### GET
 *
 * Query: `filter` (`unread` or `inbox`, default `unread`), `refresh=1` to skip the minute-long cache.
 *
 * @returns A `MailList`, or `{ error, code }` (see `GmailErrorCode`) when you are not signed in or Gmail fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const params = new URL(request.url).searchParams;
  const filter: MailFilter = MAIL_FILTERS.find((f) => f === params.get("filter")) ?? "unread";
  try {
    return Response.json(await getGmail().list(filter, params.get("refresh") === "1"));
  } catch (error) {
    return errorResponse(error);
  }
}
