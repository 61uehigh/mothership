"use client";

import { Clock, Image as ImageIcon, Paperclip } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { GmailErrorCode } from "@/lib/apiErrorCodes";
import { mailDocument, type MailDetail } from "@/features/gmail/model/Gmail";
import { gmailFailureText } from "@/features/gmail/ui/gmailFailureText";
import { Chip, FRAME_BUTTON, TabFrame } from "@/shell/tabFrame";
import type { Tab } from "@/shell/tabs";
import { useJson } from "@/ui/useJson";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";

/** The message's HTML, sandboxed: no scripts run, and the frame grows to fit its content. */
function HtmlBody({ html, images }: { html: string; images: boolean }) {
  const t = useT();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const fit = useCallback(() => {
    const body = frame.current?.contentDocument?.body;
    if (body === undefined || body === null) return;
    const measure = () => setHeight(Math.max(120, Math.ceil(body.getBoundingClientRect().height)));
    measure();
    // Images that load later (after Show images) change the height; the observer goes with the document.
    new ResizeObserver(measure).observe(body);
  }, []);
  return (
    <iframe
      ref={frame}
      title={t("gmail.message")}
      // Same origin only so the height can be read; without allow-scripts nothing in the message runs.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={mailDocument(html, images)}
      onLoad={fit}
      // The frame's color scheme is what prefers-color-scheme matches inside it; see mailDocument.
      style={{ height, colorScheme: "light" }}
      className="w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
    />
  );
}

/** e.g. "Mon, Nov 23, 14:05", in the Mac's time zone. */
function formatWhen(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

/**
 * ### MailTab
 *
 * Center tab showing one Gmail message: sender, recipients, time, and the
 * body (HTML in a sandboxed frame without remote images until you show
 * them, else plain text), with a link to its thread in Gmail. Read through
 * `GET /api/gmail/messages/[id]`; reading it here leaves it unread in Gmail.
 */
export function MailTab({ tab }: { tab: Extract<Tab, { kind: "mail" }> }) {
  const t = useT();
  const { dateLocale } = useFormat();
  const state = useJson<MailDetail, GmailErrorCode>(`/api/gmail/messages/${encodeURIComponent(tab.messageId)}`);
  const mail = state.data;
  const [images, setImages] = useState(false);
  const hasHtml = mail?.body.kind === "html";

  return (
    <TabFrame
      title={itemTitle(t, mail?.subject ?? tab.title)}
      chips={
        mail !== undefined && (
          <>
            <Chip>
              <Clock size={11} aria-hidden />
              {formatWhen(mail.at, dateLocale)}
            </Chip>
            {mail.important && <Chip className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">{t("gmail.important")}</Chip>}
            {mail.unread && <Chip>{t("gmail.unreadInGmail")}</Chip>}
          </>
        )
      }
      open={{ label: t("gmail.openIn"), url: mail?.url }}
      actions={
        hasHtml &&
        !images && (
          <button type="button" className={FRAME_BUTTON} onClick={() => setImages(true)} title={t("gmail.showImagesHint")}>
            <ImageIcon size={12} aria-hidden />
            {t("gmail.showImages")}
          </button>
        )
      }
      state={{ ...state, error: state.failure === undefined ? undefined : gmailFailureText(t, state.failure) }}
    >
      {mail !== undefined && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-zinc-500">{t("gmail.from")}</dt>
            <dd className="min-w-0 break-words">
              {mail.from === "" ? t("gmail.unknownSender") : mail.from}
              {mail.fromEmail !== undefined && mail.fromEmail !== mail.from && <span className="text-zinc-500"> &lt;{mail.fromEmail}&gt;</span>}
            </dd>
            {mail.to !== undefined && (
              <>
                <dt className="text-zinc-500">{t("gmail.to")}</dt>
                <dd className="min-w-0 break-words">{mail.to}</dd>
              </>
            )}
            {mail.cc !== undefined && (
              <>
                <dt className="text-zinc-500">{t("gmail.cc")}</dt>
                <dd className="min-w-0 break-words">{mail.cc}</dd>
              </>
            )}
          </dl>
          {mail.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {mail.attachments.map((name, index) => (
                <li key={`${name}:${index}`}>
                  <Chip>
                    <Paperclip size={11} aria-hidden />
                    {name}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          {mail.body.kind === "html" ? (
            <HtmlBody html={mail.body.html} images={images} />
          ) : (
            <p className="text-sm break-words whitespace-pre-wrap">{mail.body.text === "" ? t("gmail.noText") : mail.body.text}</p>
          )}
        </div>
      )}
    </TabFrame>
  );
}
