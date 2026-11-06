"use client";

import { Clock, LoaderCircle, MapPin, Repeat, User, Video } from "lucide-react";
import { useState } from "react";
import { useShell } from "@/shell/shellContext";
import { errorMessage } from "@/lib/errors";
import { draftFor } from "@/features/tools/ui/delegation";
import { Markdown } from "@/shell/Markdown";
import { eventHandOffItem } from "@/features/tools/ui/handOff";
import { HandOffButton, postTool, useToolDocument } from "@/features/tools/ui/toolDoc";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Chip, TabFrame } from "@/shell/tabFrame";
import { TONE_CLASSES } from "@/features/tools/ui/toolPane";
import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import type { Tab } from "@/shell/tabs";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import type { Translate } from "@/ui/i18n/translate";
import { itemTitle } from "@/ui/i18n/itemTitle";

const RESPONSE: Record<string, { label: "calendar.response.accepted" | "calendar.response.declined" | "calendar.response.tentative" | "calendar.response.needsAction"; className: string }> = {
  accepted: { label: "calendar.response.accepted", className: "text-green-600 dark:text-green-400" },
  declined: { label: "calendar.response.declined", className: "text-red-600 dark:text-red-400" },
  tentative: { label: "calendar.response.tentative", className: "text-amber-600 dark:text-amber-400" },
  needsAction: { label: "calendar.response.needsAction", className: "text-zinc-500" },
};

/** A guest's reply in words, or the raw value when Google adds a new one. */
function responseLabel(t: Translate, response: string): string {
  const known = RESPONSE[response];
  return known === undefined ? response : t(known.label);
}

const REPLIES = [
  ["accepted", "calendar.reply.yes"],
  ["tentative", "calendar.reply.maybe"],
  ["declined", "calendar.reply.no"],
] as const;

/** Going / Maybe / No for an invitation you are a guest of. */
function Rsvp({ event, onDone }: { event: CalendarEventDetail; onDone: () => void }) {
  const t = useT();
  const [sending, setSending] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function reply(response: (typeof REPLIES)[number][0]) {
    // Already your answer: sending it again would only spend a relay call.
    if (response === event.myResponse) return;
    setSending(response);
    try {
      await postTool("calendar", "/api/tools/calendar/respond", { eventId: event.id, response });
      setError(undefined);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(undefined);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{t("calendar.going")}</span>
      <SegmentedControl
        label={t("calendar.yourReply")}
        value={REPLIES.find(([value]) => value === event.myResponse)?.[0]}
        // Each choice sends a reply, so arrow keys only move focus; Enter, Space, or a click sends.
        activation="manual"
        disabled={sending !== undefined}
        options={REPLIES.map(([value, label]) => ({
          value,
          label: (
            <>
              {sending === value && <LoaderCircle size={11} className="animate-spin" aria-hidden />}
              {t(label)}
            </>
          ),
        }))}
        onChange={(value) => void reply(value)}
        className="flex gap-1"
        optionClassName={(selected) =>
          `flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${
            selected
              ? "border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
              : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          } disabled:opacity-60`
        }
      />
      {error !== undefined && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

/** e.g. "Fri, Oct 23 · 10:00–10:15", in the event's own time zone. */
function formatWhen(event: CalendarEventDetail, t: Translate, locale: string): string {
  const dayOf = (timeZone: string) => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone });
  // A bare date names that day everywhere, so it is formatted as the UTC midnight it parses to.
  if (event.dates !== undefined) return `${dayOf("UTC").format(Date.parse(`${event.dates.start}T00:00:00Z`))} · ${t("calendar.allDay")}`;
  if (event.start === undefined) return t("calendar.timeUnknown");
  const day = dayOf(event.timeZone);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: event.timeZone });
  return `${day.format(event.start)} · ${time.format(event.start)}${event.end === undefined ? "" : `–${time.format(event.end)}`}`;
}

/**
 * ### EventTab
 *
 * Center tab showing one calendar event: time, place, meeting link, guests
 * with their replies, and the description, plus Yes / Maybe / No when you are
 * invited. Read through `GET /api/tools/calendar/event`.
 */
export function EventTab({ tab }: { tab: Extract<Tab, { kind: "event" }> }) {
  const t = useT();
  const { dateLocale } = useFormat();
  const { openNewAgent } = useShell();
  const state = useToolDocument<CalendarEventDetail>(`/api/tools/calendar/event?id=${encodeURIComponent(tab.eventId)}`, "calendar");
  const event = state.data;
  const when = event === undefined ? undefined : formatWhen(event, t, dateLocale);
  const going = event?.attendees.filter((a) => a.response === "accepted").length ?? 0;

  return (
    <TabFrame
      title={itemTitle(t, event === undefined ? tab.title : event.title)}
      chips={
        event !== undefined && (
          <>
            <Chip>
              <Clock size={11} aria-hidden />
              <span className="whitespace-nowrap">{when}</span>
            </Chip>
            {event.recurring && (
              <Chip>
                <Repeat size={11} aria-hidden />
                {t("calendar.repeats")}
              </Chip>
            )}
            {event.status === "cancelled" && <Chip className={TONE_CLASSES.danger}>{t("calendar.cancelled")}</Chip>}
            {event.myResponse !== undefined && (
              <Chip className={RESPONSE[event.myResponse]?.className}>{t("calendar.you", { response: responseLabel(t, event.myResponse) })}</Chip>
            )}
          </>
        )
      }
      open={{ label: t("calendar.openIn"), url: event?.url }}
      actions={<HandOffButton onHandOff={event === undefined || when === undefined ? undefined : () => openNewAgent(draftFor("calendar", eventHandOffItem(event, when)))} />}
      state={state}
    >
      {event !== undefined && (
        <div className="flex flex-col gap-5">
          {event.myResponse !== undefined && <Rsvp event={event} onDone={state.reload} />}
          {(event.meetingUrl !== undefined || event.location !== undefined || event.organizer !== undefined) && (
            <dl className="flex flex-col gap-2 text-sm">
              {event.meetingUrl !== undefined && (
                <div className="flex items-center gap-2">
                  <Video size={14} className="shrink-0 text-zinc-500" aria-hidden />
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700"
                  >
                    {event.meetingName === undefined ? t("calendar.joinMeeting") : t("calendar.joinNamed", { name: event.meetingName })}
                  </a>
                  <span className="truncate text-xs text-zinc-500">{event.meetingUrl.replace(/^https?:\/\//, "")}</span>
                </div>
              )}
              {event.location !== undefined && (
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <span>{event.location}</span>
                </div>
              )}
              {event.organizer !== undefined && (
                <div className="flex items-center gap-2">
                  <User size={14} className="shrink-0 text-zinc-500" aria-hidden />
                  <span>{t("calendar.organizedBy", { name: event.organizer })}</span>
                </div>
              )}
            </dl>
          )}

          {event.attendees.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {t("calendar.guests")} <span className="font-normal text-zinc-500">{t("calendar.guestCount", { count: event.attendees.length, going })}</span>
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {event.attendees.map((attendee) => (
                  <li key={attendee.email ?? attendee.name} className="flex items-center gap-2">
                    <span className="min-w-0 truncate" title={attendee.email}>
                      {attendee.name}
                      {attendee.self && <span className="text-zinc-500"> {t("calendar.self")}</span>}
                      {attendee.organizer && <span className="text-zinc-500"> · {t("calendar.organizer")}</span>}
                      {attendee.optional && <span className="text-zinc-500"> · {t("calendar.optional")}</span>}
                    </span>
                    <span className={`ml-auto shrink-0 text-xs ${RESPONSE[attendee.response]?.className ?? "text-zinc-500"}`}>
                      {responseLabel(t, attendee.response)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("calendar.description")}</h2>
            {event.markdown === "" ? <p className="text-sm text-zinc-500">{t("tools.noDescription")}</p> : <Markdown>{event.markdown}</Markdown>}
          </section>
        </div>
      )}
    </TabFrame>
  );
}
