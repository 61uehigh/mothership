"use client";

import { domToCanvas } from "modern-screenshot";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { USAGE_AREA_ATTRIBUTE } from "@/shell/usage";
import { Modal } from "@/ui/Modal";
import { pageErrors } from "@/ui/pageErrors";
import { fetchJson } from "@/ui/useJson";
import type { Agent } from "@/features/sessions/model/Agent";
import type { FeedbackInput } from "@/features/feedback/model/Feedback";

/** Marks the picker's own elements, so it never picks itself. */
const OWN = "data-feedback-ui";
const PATH_DEPTH = 8;

type Target = NonNullable<FeedbackInput["target"]>;

/** A short CSS path to `element`, e.g. `aside > div:nth-of-type(2) > button`. */
function cssPath(element: Element): string {
  const parts: Array<string> = [];
  let node: Element | null = element;
  while (node !== null && node !== document.body && parts.length < PATH_DEPTH) {
    const parent: Element | null = node.parentElement;
    const tag = node.tagName.toLowerCase();
    const siblings = parent === null ? [] : [...parent.children].filter((child) => child.tagName === node?.tagName);
    parts.unshift(node.id !== "" ? `${tag}#${node.id}` : siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    node = parent;
  }
  return parts.join(" > ");
}

function describe(element: Element): Target {
  const text = (element instanceof HTMLElement ? element.innerText : (element.textContent ?? "")).replace(/\s+/g, " ").trim();
  return {
    area: element.closest(`[${USAGE_AREA_ATTRIBUTE}]`)?.getAttribute(USAGE_AREA_ATTRIBUTE) ?? "other",
    path: cssPath(element),
    text: text.length > 300 ? `${text.slice(0, 299)}…` : text,
    label: element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.getAttribute("placeholder") ?? "",
  };
}

/** The whole window as a PNG, with the picked element outlined. */
async function screenshot(picked: DOMRect | undefined): Promise<string | undefined> {
  try {
    const canvas = await domToCanvas(document.body, {
      scale: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      filter: (node) => !(node instanceof Element && node.hasAttribute(OWN)),
    });
    const context = canvas.getContext("2d");
    if (picked !== undefined && context !== null) {
      context.strokeStyle = "#ef4444";
      context.lineWidth = 3;
      context.strokeRect(picked.left - 2, picked.top - 2, picked.width + 4, picked.height + 4);
    }
    return canvas.toDataURL("image/png");
  } catch {
    // A page the library cannot draw (an iframe, a cross-origin image) still gets its feedback, without a picture.
    return undefined;
  }
}

/** Hover to highlight, click to pick; Esc means the screen as a whole. */
function Picker({ onPick }: { onPick: (element: Element | undefined) => void }) {
  const [box, setBox] = useState<DOMRect | undefined>(undefined);
  const hovered = useRef<Element | undefined>(undefined);

  useEffect(() => {
    const under = (event: MouseEvent) => document.elementsFromPoint(event.clientX, event.clientY).find((el) => !el.closest(`[${OWN}]`));
    const onMove = (event: MouseEvent) => {
      hovered.current = under(event);
      setBox(hovered.current?.getBoundingClientRect());
    };
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onPick(under(event));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onPick(undefined);
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onPick]);

  return (
    <div {...{ [OWN]: "" }} className="pointer-events-none fixed inset-0 z-[100]">
      <div className="absolute inset-x-0 top-2 mx-auto w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
        Click the part you want changed · Esc for the whole screen
      </div>
      {box !== undefined && (
        <div
          className="absolute rounded-sm border-2 border-red-500 bg-red-500/10"
          style={{ left: box.left - 2, top: box.top - 2, width: box.width + 4, height: box.height + 4 }}
        />
      )}
    </div>
  );
}

/**
 * ### FeedbackFlow
 *
 * Developer mode feedback: pick the part of the screen you mean (or the
 * whole screen), say what should change, and a session starts working on
 * mothership's own code with a screenshot, the page's recent errors, and the
 * server log. Its session opens in a tab.
 */
export function FeedbackFlow({ onClose }: { onClose: () => void }) {
  const workbench = useWorkbench();
  const [stage, setStage] = useState<"pick" | "capture" | "write">("pick");
  const [target, setTarget] = useState<Target | undefined>(undefined);
  const [image, setImage] = useState<string | undefined>(undefined);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | undefined }>({ busy: false, error: undefined });

  async function picked(element: Element | undefined) {
    setStage("capture");
    setTarget(element === undefined ? undefined : describe(element));
    // Let the picker's highlight leave the screen before the picture is taken.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    setImage(await screenshot(element?.getBoundingClientRect()));
    setStage("write");
  }

  async function submit() {
    setState({ busy: true, error: undefined });
    const input: FeedbackInput = {
      text,
      screen: document.querySelector("[role=tabpanel]")?.getAttribute(USAGE_AREA_ATTRIBUTE) ?? "none",
      target,
      screenshot: image,
      pageErrors: pageErrors().map((e) => `${new Date(e.at).toLocaleTimeString()} ${e.message}`),
      viewport: { width: window.innerWidth, height: window.innerHeight, theme: document.documentElement.classList.contains("dark") ? "dark" : "light" },
    };
    const result = await fetchJson<Agent>("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!result.ok) {
      setState({ busy: false, error: result.error });
      return;
    }
    workbench.open({ kind: "session", agentId: result.data.id });
    onClose();
  }

  if (stage === "pick") return <Picker onPick={(element) => void picked(element)} />;
  if (stage === "capture") {
    return (
      <div {...{ [OWN]: "" }} className="fixed inset-x-0 top-2 z-[100] mx-auto flex w-fit items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
        <LoaderCircle size={12} className="animate-spin" aria-hidden /> Taking a screenshot…
      </div>
    );
  }
  return (
    <Modal label="Feedback" onClose={onClose}>
      <form
        className="flex w-[34rem] max-w-full flex-col gap-3 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">Feedback</h2>
        <p className="text-xs text-zinc-500">
          A session will change mothership&apos;s code in its own worktree. Review its changes and merge them when they look right.
        </p>
        <textarea
          className="min-h-28 w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700"
          data-autofocus
          placeholder="What should change? e.g. Make the reply box taller and keep it open after sending."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-col gap-1 rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
          <span>
            {target === undefined ? "The whole screen" : `${target.label || target.text.slice(0, 60) || target.path} · ${target.area}`}
          </span>
          {image !== undefined && (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL made here, not a page asset
            <img src={image} alt="Screenshot that will be attached" className="max-h-40 w-full rounded border border-zinc-200 object-contain object-left dark:border-zinc-800" />
          )}
          <span>
            {pageErrors().length} recent page error{pageErrors().length === 1 ? "" : "s"} and the server log will be attached.
          </span>
        </div>
        {state.error !== undefined && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.busy || text.trim() === ""}
            className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {state.busy ? "Starting…" : "Start session"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
