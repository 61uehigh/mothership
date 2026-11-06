"use client";

import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { DockerErrorCode } from "@/lib/apiErrorCodes";
import { ACTION_LABEL, ActionIcon, STATE_LABEL, healthLabel } from "@/features/docker/ui/actionIcons";
import { STATE_DOT, actionsFor, useContainerActions } from "@/features/docker/ui/containerActions";
import { dockerFailureText } from "@/features/docker/ui/dockerFailureText";
import { LogsViewer } from "@/features/docker/ui/LogsViewer";
import { RefreshButton } from "@/ui/iconButtons";
import { Message } from "@/ui/Message";
import { useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { usePageVisible } from "@/ui/usePageVisible";
import type { Tab } from "@/shell/tabs";
import type { ContainerDetail } from "@/features/docker/model/Docker";
import { durationIn, relativeTimeIn } from "@/ui/i18n/format";
import type { Locale, Translate } from "@/ui/i18n/translate";
import { useLocale, useT } from "@/ui/i18n/useT";

const POLL_MS = 10_000;
const CLOCK_TICK_MS = 30_000;

const BUTTON =
  "flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function lifeline(detail: ContainerDetail, now: number, t: Translate, locale: Locale): string | undefined {
  if (now === 0) return undefined;
  if (detail.state === "running" && detail.startedAt !== undefined) {
    return t("docker.upFor", { duration: durationIn(locale, now - Date.parse(detail.startedAt)) });
  }
  if (detail.state === "created") return t("docker.neverStarted");
  if (detail.finishedAt !== undefined) {
    return t("docker.exitedWith", { code: detail.exitCode, when: relativeTimeIn(locale, Date.parse(detail.finishedAt), now) });
  }
  return undefined;
}

/**
 * ### ContainerTab
 *
 * Center tab for one Docker container: state, image, and uptime with start,
 * stop, and restart buttons (stopping asks for confirmation first), an info
 * block with ports, mounts, networks, environment variable names, and the
 * command, and a logs viewer.
 */
export function ContainerTab({ tab }: { tab: Extract<Tab, { kind: "container" }> }) {
  const t = useT();
  const { locale } = useLocale();
  const now = useNow(CLOCK_TICK_MS);
  const visible = usePageVisible();
  // One inspect at a time, paused while the browser tab is hidden. A passing failure keeps the last good details
  // (and the logs viewer) on screen; a gone container replaces them.
  const { data, failure, loading, reload } = useJson<ContainerDetail, DockerErrorCode>(`/api/docker/containers/${encodeURIComponent(tab.id)}`, {
    pollMs: visible ? POLL_MS : undefined,
  });
  const actions = useContainerActions(reload);

  if (failure?.status === 404) return <Message size="tab">{t("docker.gone", { name: tab.name })}</Message>;
  if (data === undefined) {
    if (failure === undefined) return <Message size="tab">{t("docker.loadingNamed", { name: tab.name })}</Message>;
    return (
      <Message size="tab" tone="error" onRetry={reload}>
        {dockerFailureText(t, failure)}
      </Message>
    );
  }

  const detail = data;
  const busy = actions.busy === detail.id;
  const confirming = actions.confirming === detail.id;
  const life = lifeline(detail, now, t, locale);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold">{detail.name}</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className={`size-2 rounded-full ${STATE_DOT[detail.state]}`} aria-hidden />
            {t(STATE_LABEL[detail.state])}
            {detail.health !== undefined && <span className={detail.health === "unhealthy" ? "text-red-600 dark:text-red-400" : ""}>· {healthLabel(t, detail.health)}</span>}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {confirming ? (
              <>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{t("docker.stopConfirm")}</span>
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                  onClick={() => actions.request(detail.id, "stop")}
                >
                  {t("docker.action.stop")}
                </button>
                <button type="button" className={BUTTON} onClick={actions.cancel}>
                  {t("ui.cancel")}
                </button>
              </>
            ) : (
              actionsFor(detail.state).map((action) => (
                <button key={action} type="button" disabled={actions.busy !== undefined} className={BUTTON} onClick={() => actions.request(detail.id, action)}>
                  {busy ? <RefreshCw size={12} className="animate-spin" /> : <ActionIcon action={action} size={12} />}
                  {t(ACTION_LABEL[action])}
                </button>
              ))
            )}
            <RefreshButton loading={loading} onClick={reload} size={13} />
          </span>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-zinc-500">
          <span className="font-mono">{detail.image}</span>
          {life !== undefined && <span>· {life}</span>}
          {detail.restartCount > 0 && <span>· {t("docker.restarted", { count: detail.restartCount })}</span>}
          {detail.project !== undefined && (
            <span>
              · {detail.project}
              {detail.service !== undefined ? ` / ${detail.service}` : ""}
            </span>
          )}
        </p>
        {actions.error?.id === detail.id && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{dockerFailureText(t, actions.error.failure)}</p>}
      </header>
      <dl className="grid max-h-[40%] shrink-0 grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 overflow-y-auto border-b border-zinc-200 px-4 py-3 text-xs dark:border-zinc-800">
        <Info label={t("docker.info.ports")}>{detail.ports.length === 0 ? <None /> : <Chips items={detail.ports} mono />}</Info>
        <Info label={t("docker.info.mounts")}>
          {detail.mounts.length === 0 ? (
            <None />
          ) : (
            <ul className="flex flex-col gap-0.5 font-mono">
              {detail.mounts.map((m) => (
                <li key={`${m.source}:${m.destination}`} className="break-all">
                  {m.source} → {m.destination}
                  <span className="ml-1 font-sans text-zinc-500">
                    ({m.type}
                    {m.readOnly ? t("docker.readOnly") : ""})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Info>
        <Info label={t("docker.info.networks")}>{detail.networks.length === 0 ? <None /> : <Chips items={detail.networks} />}</Info>
        <Info label={t("docker.info.environment")}>{detail.envNames.length === 0 ? <None /> : <Chips items={detail.envNames} mono />}</Info>
        <Info label={t("docker.info.command")}>
          <code className="break-all font-mono">{detail.command}</code>
        </Info>
      </dl>
      <LogsViewer containerId={detail.id} />
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="py-0.5 text-zinc-500">{label}</dt>
      <dd className="min-w-0 py-0.5 text-zinc-800 dark:text-zinc-200">{children}</dd>
    </>
  );
}

function Chips({ items, mono = false }: { items: Array<string>; mono?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className={`rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] dark:bg-zinc-800 ${mono ? "font-mono" : ""}`}>
          {item}
        </span>
      ))}
    </span>
  );
}

function None() {
  const t = useT();
  return <span className="text-zinc-500">{t("docker.none")}</span>;
}
