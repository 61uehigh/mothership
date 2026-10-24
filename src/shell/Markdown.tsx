"use client";

import { Children, isValidElement, useState, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Tab } from "@/shell/tabs";

const NUCLINO_ITEM = /^https:\/\/app\.nuclino\.com\/t\/b\/([0-9a-f-]{36})(?:[?#].*)?$/i;
const LINEAR_ISSUE = /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]*-\d+)(?:[/?#].*)?$/i;

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children);
      return "";
    })
    .join("");
}

/** A Nuclino doc or Linear issue link that can open as a tab here instead. */
function internalTab(href: string, label: string): Tab | undefined {
  const doc = NUCLINO_ITEM.exec(href);
  if (doc !== null) return { kind: "doc", itemId: doc[1].toLowerCase(), title: label || "Nuclino doc" };
  const issue = LINEAR_ISSUE.exec(href);
  if (issue !== null) return { kind: "issue", issueId: issue[1].toUpperCase(), title: label || issue[1].toUpperCase() };
  return undefined;
}


/**
 * An image in tool content. Remote images load only when you ask: an image
 * in a Slack message or an invite from someone else could be a tracker that
 * learns when, and from where, you read it.
 */
function ContentImage({ src, alt }: { src: string; alt: string }) {
  const remote = /^https?:\/\//i.test(src);
  const [shown, setShown] = useState(!remote);
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="my-1 inline-flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        Show image{alt === "" ? "" : `: ${alt}`} <span className="text-zinc-400">({new URL(src).host})</span>
      </button>
    );
  }
  // External images of unknown size from the tool's content; next/image needs known hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className="my-2 inline-block h-auto max-w-full rounded" />;
}

const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="mt-6 mb-3 border-b border-zinc-200 pb-1.5 text-2xl font-semibold first:mt-0 dark:border-zinc-800">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2.5 border-b border-zinc-200 pb-1 text-xl font-semibold first:mt-0 dark:border-zinc-800">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-4 mb-1.5 text-sm font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-4 mb-1.5 text-sm font-semibold text-zinc-500 first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-2.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) => (
    <ul className={`my-2 pl-6 ${className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc"} [&_ol]:my-1 [&_ul]:my-1`}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-decimal pl-6 [&_ol]:my-1 [&_ul]:my-1">{children}</ol>,
  li: ({ children }) => <li className="my-0.5 leading-relaxed [&>input]:mr-1.5 [&>input]:align-middle">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-zinc-200 dark:border-zinc-800" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-zinc-100 dark:bg-zinc-900">{children}</thead>,
  th: ({ children, style }) => (
    <th style={style} className="border border-zinc-200 px-2.5 py-1.5 text-left font-semibold dark:border-zinc-800">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-zinc-200 px-2.5 py-1.5 align-top dark:border-zinc-800">
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-100 p-3 text-[13px] leading-snug dark:border-zinc-800 dark:bg-zinc-900 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={`rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800 ${className ?? ""}`}>{children}</code>
  ),
  img: ({ src, alt }) => (typeof src === "string" ? <ContentImage src={src} alt={alt ?? ""} /> : undefined),
  del: ({ children }) => <del className="text-zinc-500">{children}</del>,
};

/** The default URL sanitizer, except that it keeps the `mention:` links made by the tool loaders. */
function keepMentions(url: string): string {
  return url === "mention:me" || url === "mention:other" ? url : defaultUrlTransform(url);
}

/**
 * ### Markdown
 *
 * Renders tool content (Nuclino docs, Linear descriptions and comments) as
 * GitHub-flavoured Markdown for light and dark themes. Raw HTML is skipped.
 * Links open in a new browser tab, except Nuclino doc and Linear issue links,
 * which open as tabs here (hold Cmd or Ctrl to open them in the browser).
 * `mention:me` / `mention:other` links (from the Slack and Linear loaders)
 * are drawn as highlighted names: yours in amber, others in blue.
 */
export function Markdown({ children }: { children: string }) {
  const workbench = useWorkbench();
  const components: Components = {
    ...COMPONENTS,
    a: ({ href, children: label }) => {
      if (href === "mention:me" || href === "mention:other") {
        return (
          <span
            className={
              href === "mention:me"
                ? "rounded bg-amber-300 px-1 font-semibold text-amber-950 ring-1 ring-amber-500 dark:bg-amber-400"
                : "rounded bg-sky-100 px-1 font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200"
            }
          >
            {label}
          </span>
        );
      }
      const tab = href === undefined ? undefined : internalTab(href, textOf(label).trim());
      const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (tab === undefined || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        workbench.open(tab, { preview: true });
      };
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-400/30 dark:hover:decoration-teal-400"
        >
          {label}
        </a>
      );
    },
  };
  return (
    <div className="text-sm break-words text-zinc-800 dark:text-zinc-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components} urlTransform={keepMentions}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
