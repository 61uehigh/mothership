"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { statusColor, statusTitle } from "@/features/explorer/ui/fileStatus";
import { openPathIn } from "@/features/explorer/ui/openPath";
import { RefreshButton } from "@/ui/IconButton";
import { Message } from "@/ui/Message";
import { Markdown } from "@/shell/Markdown";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { useJson, useText } from "@/ui/useJson";
import { LOCAL_ROOT } from "@/features/explorer/model/Files";
import type { Tab } from "@/shell/tabs";
import type { FileContent } from "@/features/explorer/model/Files";

/**
 * Shiki is rendered with `defaultColor: false`, so tokens only carry CSS variables; these rules pick the
 * theme (`.dark` on <html>) and draw line numbers. A `<style>` tag because the Turbopack CSS rule in
 * next.config.ts compiles every `.css` file as global CSS, so CSS modules are not available.
 */
const CODE_CSS = `
.file-code .shiki,
.file-code .shiki span {
  color: var(--shiki-light);
  font-style: var(--shiki-light-font-style);
  font-weight: var(--shiki-light-font-weight);
  text-decoration: var(--shiki-light-text-decoration);
}

.dark .file-code .shiki,
.dark .file-code .shiki span {
  color: var(--shiki-dark) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}

/* The pane supplies the background so the viewer matches the zinc chrome in both themes. */
.file-code .shiki {
  margin: 0;
  padding: 0.5rem 0;
  background-color: transparent;
  outline: none;
  counter-reset: line;
}

.file-code .shiki code {
  display: block;
  min-width: max-content;
}

.file-code .shiki .line {
  display: inline-block;
  min-width: 100%;
  padding-right: 1rem;
}

.file-code .shiki .line::before {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: var(--gutter-width, 4ch);
  margin-right: 1.25rem;
  padding-right: 0.5rem;
  text-align: right;
  color: var(--color-zinc-400, #a1a1aa);
  user-select: none;
}

.file-code .shiki .line:hover {
  background-color: color-mix(in oklab, var(--color-zinc-500, #71717a) 8%, transparent);
}

.dark .file-code .shiki .line::before {
  color: var(--color-zinc-600, #52525b);
}
`;

type FileTabProps = { tab: Extract<Tab, { kind: "file" }> };
type Viewer = "image" | "pdf" | "video" | "audio" | "markdown" | "code";

const VIEWERS: Record<string, Viewer> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", bmp: "image", ico: "image", svg: "image",
  pdf: "pdf",
  mp4: "video", webm: "video", mov: "video",
  mp3: "audio", wav: "audio", m4a: "audio",
  md: "markdown", markdown: "markdown",
};

const rawUrl = (tab: FileTabProps["tab"]) => `/api/files/raw?${new URLSearchParams({ root: tab.root, path: tab.path })}`;

/**
 * ### FileTab
 *
 * Read-only viewer for one file, chosen by its extension: images, PDFs,
 * audio, and video are shown as they are; Markdown is rendered (with its
 * source a click away); everything else is Shiki-highlighted source.
 */
export function FileTab({ tab }: FileTabProps) {
  const viewer = VIEWERS[tab.path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "code";
  if (viewer === "code") return <CodeFile tab={tab} />;
  if (viewer === "markdown") return <MarkdownFile tab={tab} />;
  return <MediaFile tab={tab} viewer={viewer} />;
}

function OpenInEditor({ tab }: FileTabProps) {
  /** Session roots open the whole worktree; workspace and local files open on their own. */
  const session = tab.root !== "workspace" && tab.root !== LOCAL_ROOT;
  return (
    <button
      type="button"
      title={session ? "Open the session's folder in VS Code" : "Open this file in VS Code"}
      className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      // A session file opens its whole folder, so the editor has the project around it.
      onClick={() => openPathIn(tab.root, session ? "" : tab.path, "vscode")}
    >
      <ExternalLink size={13} aria-hidden />
      Open in editor
    </button>
  );
}

function FileHeader({ tab, children }: FileTabProps & { children?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-800">
      <span className="min-w-0 flex-1 truncate font-mono text-zinc-700 dark:text-zinc-300" title={tab.path}>
        {tab.path}
      </span>
      {children}
      <OpenInEditor tab={tab} />
    </header>
  );
}

/** Images, PDFs, audio, and video, straight from `/api/files/raw`. */
function MediaFile({ tab, viewer }: FileTabProps & { viewer: Exclude<Viewer, "markdown" | "code"> }) {
  // Bumped by Reload so the browser fetches the file again.
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = `${rawUrl(tab)}&v=${version}`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileHeader tab={tab}>
        <RefreshButton loading={false} onClick={() => setVersion((v) => v + 1)} label="Reload file" size={13} />
      </FileHeader>
      {failed ? (
        <Message size="tab" tone="error" onRetry={() => (setFailed(false), setVersion((v) => v + 1))}>
          Couldn&apos;t open this file. It may be too large (over 50 MB), secret, or gone.
        </Message>
      ) : viewer === "pdf" ? (
        <iframe key={src} src={src} title={tab.path} className="min-h-0 w-full flex-1 bg-white" />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-100 p-4 dark:bg-zinc-900">
          {viewer === "image" ? (
            // Local files of unknown size; next/image needs known sources and sizes.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={tab.path} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain [image-rendering:auto]" />
          ) : viewer === "video" ? (
            <video key={src} src={src} controls onError={() => setFailed(true)} className="max-h-full max-w-full" />
          ) : (
            <audio key={src} src={src} controls onError={() => setFailed(true)} />
          )}
        </div>
      )}
    </div>
  );
}

/** Markdown rendered, with the highlighted source a click away. */
function MarkdownFile({ tab }: FileTabProps) {
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const text = useText(mode === "preview" ? rawUrl(tab) : undefined);
  const toggle = (
    <SegmentedControl
      label="Show"
      value={mode}
      options={[
        { value: "preview", label: "Preview" },
        { value: "source", label: "Source" },
      ]}
      onChange={setMode}
      className="flex shrink-0 rounded-md bg-zinc-200/70 p-0.5 dark:bg-zinc-800/70"
      optionClassName={(selected) => `rounded px-1.5 py-0.5 ${selected ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
    />
  );
  if (mode === "source") return <CodeFile tab={tab} extra={toggle} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileHeader tab={tab}>
        {toggle}
        <RefreshButton loading={text.loading} onClick={text.reload} label="Reload file" size={13} />
      </FileHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-white dark:bg-zinc-950">
        {text.error !== undefined ? (
          <Message size="tab" tone="error" onRetry={text.reload}>
            Couldn&apos;t open this file: {text.error}
          </Message>
        ) : text.data === undefined ? (
          <p className="flex items-center gap-2 p-4 text-sm text-zinc-500">
            <LoaderCircle size={14} className="animate-spin" aria-hidden />
            Loading file…
          </p>
        ) : (
          <article className="mx-auto max-w-3xl px-6 py-6">
            <Markdown>{text.data}</Markdown>
          </article>
        )}
      </div>
    </div>
  );
}

/**
 * Shiki-highlighted source with line numbers, the file's language and git
 * status. Files over 1 MB show their first 1 MB.
 */
function CodeFile({ tab, extra }: FileTabProps & { extra?: ReactNode }) {
  const file = useJson<FileContent>(`/api/files/content?${new URLSearchParams({ root: tab.root, path: tab.path })}`);
  // A failed reload replaces the file with the error.
  const content = file.error === undefined ? file.data : undefined;
  const gutter = `${Math.max(String(content?.lines ?? 0).length, 2) + 1}ch`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <style>{CODE_CSS}</style>
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-800">
        <span className="min-w-0 flex-1 truncate font-mono text-zinc-700 dark:text-zinc-300" title={tab.path}>
          {tab.path}
        </span>
        {content?.status !== undefined && (
          <span className={`shrink-0 font-medium ${statusColor(content.status)}`}>{statusTitle(content.status)}</span>
        )}
        {content !== undefined && <span className="shrink-0 text-zinc-500">{content.language}</span>}
        {content !== undefined && <span className="shrink-0 text-zinc-500">{content.lines.toLocaleString()} lines</span>}
        {extra}
        <RefreshButton loading={file.loading} onClick={file.reload} label="Reload file" size={13} />
        <OpenInEditor tab={tab} />
      </header>
      {content?.truncated === true && (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          This file is larger than 1 MB. Showing the first 1 MB only.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-white dark:bg-zinc-950">
        {file.data === undefined && file.error === undefined && (
          <p className="flex items-center gap-2 p-4 text-sm text-zinc-500">
            <LoaderCircle size={14} className="animate-spin" aria-hidden />
            Loading file…
          </p>
        )}
        {file.error !== undefined && (
          <Message size="tab" tone="error" onRetry={file.reload}>
            Couldn&apos;t open this file: {file.error}
          </Message>
        )}
        {content !== undefined && content.lines === 0 && <p className="p-4 text-sm text-zinc-500">This file is empty.</p>}
        {content !== undefined && content.lines > 0 && (
          <div
            className={`file-code font-mono text-[12.5px] leading-5`}
            // `--gutter-width` sizes the line-number column; cast because CSSProperties has no custom-property keys.
            style={{ "--gutter-width": gutter } as CSSProperties}
            // Shiki escapes the file's text; the markup is only its own spans.
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        )}
      </div>
    </div>
  );
}
