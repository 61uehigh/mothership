"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Wait before the first tooltip, so passing over buttons shows nothing. */
const SHOW_DELAY_MS = 350;

/** Within this long after one hides, the next shows at once, as you move along a toolbar. */
const WARM_MS = 600;

/** Space between the control and its tooltip, and kept from the window's edges. */
const GAP = 6;

/** Holds a control's tooltip once its `title` is taken over, so the browser's own slow one never shows too. */
const TOOLTIP_ATTRIBUTE = "data-tooltip";

type Shown = { text: string; anchor: DOMRect };

/** Moves `title` to {@link TOOLTIP_ATTRIBUTE}; a control named only by its title keeps that name as its label. */
function takeTitle(element: Element) {
  const title = element.getAttribute("title");
  if (title === null) return;
  element.removeAttribute("title");
  if (title === "") return;
  element.setAttribute(TOOLTIP_ATTRIBUTE, title);
  const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") || (element.textContent ?? "").trim() !== "";
  if (!named) element.setAttribute("aria-label", title);
}

/** Whether `element`'s own text is cut short, so a tooltip repeating it still helps. */
function truncated(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth + 1 || [...element.querySelectorAll<HTMLElement>("*")].some((child) => child.scrollWidth > child.clientWidth + 1);
}

/**
 * The tooltip for what the pointer or keyboard is on: the nearest `title`
 * (taken over from the browser), else an icon-only control's `aria-label`.
 * A tooltip that only repeats text already in full view is skipped.
 */
function tooltipFor(target: EventTarget | null): { element: HTMLElement; text: string } | undefined {
  if (!(target instanceof Element)) return undefined;
  const titled = target.closest("[title]");
  if (titled !== null) takeTitle(titled);
  const element = target.closest<HTMLElement>(`[${TOOLTIP_ATTRIBUTE}], button[aria-label], a[aria-label], [role="button"][aria-label]`);
  if (element === null) return undefined;
  const own = element.getAttribute(TOOLTIP_ATTRIBUTE);
  const visible = (element.textContent ?? "").trim();
  if (own !== null) {
    if (own.trim() === visible && !truncated(element)) return undefined;
    return { element, text: own };
  }
  // An aria-label is a tooltip only for a control showing no words of its own.
  if (visible !== "") return undefined;
  const label = element.getAttribute("aria-label") ?? "";
  return label === "" ? undefined : { element, text: label };
}

/**
 * ### TooltipLayer
 *
 * Tooltips for the whole app, mounted once by the shell. Hovering a control
 * (or reaching it with the keyboard) shows what it does in a small dark
 * label under it, quicker than the browser's own `title` tooltip and on
 * disabled buttons too. Controls need nothing new: their `title`, or an
 * icon button's `aria-label`, is the text.
 */
export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | undefined>(undefined);
  const [place, setPlace] = useState<{ left: number; top: number } | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hiddenAt = 0;

    const hide = () => {
      clearTimeout(timer);
      if (current !== undefined) hiddenAt = Date.now();
      current = undefined;
      setShown(undefined);
    };
    const show = (found: { element: HTMLElement; text: string }, delay: number) => {
      clearTimeout(timer);
      current = found.element;
      const open = () => {
        if (current !== found.element || !found.element.isConnected) return;
        setShown({ text: found.text, anchor: found.element.getBoundingClientRect() });
      };
      if (delay === 0 || Date.now() - hiddenAt < WARM_MS) open();
      else timer = setTimeout(open, delay);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const found = tooltipFor(event.target);
      if (found?.element === current) return;
      if (current !== undefined) hide();
      if (found !== undefined) show(found, SHOW_DELAY_MS);
    };
    const onOut = (event: PointerEvent) => {
      if (current === undefined) return;
      if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
      hide();
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(":focus-visible")) return;
      const found = tooltipFor(event.target);
      if (found === undefined) return;
      show(found, 0);
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Under the control, centred on it; above it when there is no room below; never past the window's edges.
  useLayoutEffect(() => {
    if (shown === undefined || box.current === null) {
      setPlace(undefined);
      return;
    }
    const { width, height } = box.current.getBoundingClientRect();
    const { anchor } = shown;
    const left = Math.min(Math.max(GAP, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - GAP);
    const below = anchor.bottom + GAP;
    const top = below + height + GAP <= window.innerHeight ? below : Math.max(GAP, anchor.top - GAP - height);
    setPlace({ left, top });
  }, [shown]);

  if (shown === undefined) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      aria-hidden
      style={place ?? { left: 0, top: 0, visibility: "hidden" }}
      className="pointer-events-none fixed z-[100] max-w-72 rounded-md bg-zinc-900 px-2 py-1 text-[11px] leading-4 whitespace-pre-line text-zinc-50 shadow-lg dark:border dark:border-zinc-700 dark:bg-zinc-800"
    >
      {shown.text}
    </div>
  );
}
