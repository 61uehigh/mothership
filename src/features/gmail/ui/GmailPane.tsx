"use client";

import type { GmailErrorCode } from "@/lib/apiErrorCodes";
import { SetUpNotice } from "@/shell/SetUpNotice";
import { ExternalLink } from "lucide-react";
import { useContext, useEffect, type ReactNode } from "react";
import { gmailFailureText } from "@/features/gmail/ui/gmailFailureText";
import { gmailInboxUrl, gmailThreadUrl, MAIL_FILTERS, type GmailStatus, type MailFilter, type MailList, type MailSummary } from "@/features/gmail/model/Gmail";
import { PaneHeader, StackedSectionContext } from "@/shell/PaneHeader";
import { openSettingsPage } from "@/shell/settingsPage";
import { useWorkbench } from "@/shell/workbenchContext";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { ICON_BUTTON, RefreshButton, ROW_ACTION } from "@/ui/iconButtons";
import { Message } from "@/ui/Message";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { ROW_HOVER, SELECTED_ROW, SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import { useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { useStoredState } from "@/ui/useStoredState";

const CLOCK_TICK_MS = 30_000;
/** New mail shows up without a click this often, while the app is in front. */
const POLL_MS = 120_000;
const FILTER_KEY = "mothership.gmail.filter";
const parseFilter = (raw: string): MailFilter | undefined => MAIL_FILTERS.find((filter) => filter === raw);

/**
 * ### GmailPane
 *
 * The Gmail section: your inbox's newest unread messages (or all of its
 * newest), one fixed-height line each. A click opens the message in a tab;
 * the icon on hover opens it in Gmail. Read-only: reading a message here
 * leaves it unread in Gmail. Until you sign in it links to Settings →
 * Connections, where the sign-in is.
 */
export function GmailPane() {
  const t = useT();
  const folded = useContext(StackedSectionContext)?.collapsed === true;
  const workbench = useWorkbench();
  const active = workbench.active?.tab;
  const now = useNow(CLOCK_TICK_MS);
  const [filter, setFilter] = useStoredState<MailFilter>(FILTER_KEY, "unread", parseFilter);
  const status = useJson<GmailStatus, GmailErrorCode>(folded ? undefined : "/api/gmail/status");
  const connected = status.data?.state === "connected";
  // You sign in from Settings, in your browser; coming back to the app picks it up.
  const { reload: reloadStatus } = status;
  useEffect(() => {
    if (connected) return;
    window.addEventListener("focus", reloadStatus);
    return () => window.removeEventListener("focus", reloadStatus);
  }, [connected, reloadStatus]);

  const list = useJson<MailList, GmailErrorCode>(connected && !folded ? `/api/gmail/messages?filter=${filter}` : undefined, { pollMs: POLL_MS, refreshOnReload: true, keepPrevious: true });
  const email = list.data?.email ?? status.data?.email;

  function openConnections() {
    openSettingsPage("connections", () => workbench.open({ kind: "settings" }), "gmail");
  }

  // A list call that finds the sign-in gone or expired says more than the last status check.
  const listCode = list.failure?.code;
  const state = listCode === "expired" || listCode === "disconnected" || listCode === "unconfigured" ? listCode : status.data?.state;

  let body: ReactNode;
  if (status.failure !== undefined && status.data === undefined) {
    body = <Message tone="error" onRetry={status.reload}>{gmailFailureText(t, status.failure)}</Message>;
  } else if (status.data === undefined) {
    body = <Message>{t("gmail.checking")}</Message>;
  } else if (state === "unconfigured" || state === "disconnected" || state === "expired") {
    body = (
      <SetUpNotice
        title={t(state === "expired" ? "tools.signInExpired" : "tools.notConnected")}
        action={t(state === "expired" ? "tools.signInAgain" : "tools.setUpInSettings")}
        onAction={openConnections}
      >
        {t(state === "expired" ? "gmail.expired" : "gmail.setUp")}
      </SetUpNotice>
    );
  } else if (list.failure !== undefined && list.data === undefined) {
    body = (
      <>
        <Message tone={listCode === "quota" ? "muted" : "error"} onRetry={list.reload}>
          {gmailFailureText(t, list.failure)}
        </Message>
        {(listCode === "api-disabled" || listCode === "scope") && (
          <button type="button" onClick={openConnections} className="mx-2 text-xs text-teal-700 underline dark:text-teal-400">
            {t("tools.fixInSettings")}
          </button>
        )}
      </>
    );
  } else if (list.data === undefined) {
    body = <Message>{t("gmail.loading")}</Message>;
  } else if (list.data.messages.length === 0) {
    body = <Message>{t(filter === "unread" ? "gmail.noUnread" : "gmail.emptyInbox")}</Message>;
  } else {
    body = (
      <ul>
        {list.data.messages.map((mail) => (
          <MailRow
            key={mail.id}
            mail={mail}
            now={now}
            email={email}
            selected={active?.kind === "mail" && active.messageId === mail.id}
            onOpen={() => workbench.open({ kind: "mail", messageId: mail.id, title: mail.subject }, { preview: true })}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={t("section.gmail")}>
        {connected && (
          <SegmentedControl
            label={t("gmail.show")}
            value={filter}
            options={[
              { value: "unread", label: t("gmail.filter.unread") },
              { value: "inbox", label: t("gmail.filter.inbox") },
            ]}
            onChange={setFilter}
            className="flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800/60"
            optionClassName={(selected) => `whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
          />
        )}
        {connected && (
          <a className={ICON_BUTTON} href={gmailInboxUrl(email)} target="_blank" rel="noopener noreferrer" title={t("gmail.open")} aria-label={t("gmail.open")}>
            <ExternalLink size={14} />
          </a>
        )}
        <RefreshButton
          loading={status.loading || list.loading}
          label={t("gmail.refresh")}
          onClick={() => {
            status.reload();
            list.reload();
          }}
        />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">{body}</div>
    </div>
  );
}

/** One message on one line of fixed height: unread dot, sender, subject, then the time, which the Gmail link covers on hover. */
function MailRow({ mail, now, email, selected, onOpen }: { mail: MailSummary; now: number; email: string | undefined; selected: boolean; onOpen: () => void }) {
  const t = useT();
  const { relativeTime } = useFormat();
  const subject = itemTitle(t, mail.subject);
  const sender = mail.from === "" ? t("gmail.unknownSender") : mail.from;
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        title={`${sender}${mail.fromEmail === undefined || mail.fromEmail === mail.from ? "" : ` <${mail.fromEmail}>`}\n${subject}\n${mail.snippet}`}
        className={`flex h-7 w-full items-center gap-1.5 rounded-md pl-1 pr-2 text-left text-[13px] ${selected ? SELECTED_ROW : ROW_HOVER}`}
      >
        {/* Always takes its width, so the text never moves when a message is read. */}
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${mail.unread ? "bg-teal-500" : ""}`} />
        {mail.unread && <span className="sr-only">{t("gmail.unreadPrefix")} </span>}
        <span className={`w-24 shrink-0 truncate ${mail.unread ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-500"}`}>{sender}</span>
        <span className={`min-w-0 flex-1 truncate ${mail.unread ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-500"}`}>
          {mail.important && <span aria-label={t("gmail.important")} title={t("gmail.important")} className="mr-1 text-amber-500">›</span>}
          {subject}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-zinc-500 group-focus-within:opacity-0 group-hover:opacity-0">{relativeTime(mail.at, now)}</span>
      </button>
      {/* Over the time, which hides on hover: the row keeps its height. */}
      <a
        href={gmailThreadUrl(email, mail.threadId)}
        target="_blank"
        rel="noopener noreferrer"
        title={t("gmail.openIn")}
        aria-label={t("gmail.openIn")}
        className={`absolute right-1 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 ${ROW_ACTION}`}
      >
        <ExternalLink size={12} />
      </a>
    </li>
  );
}
