"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * ### Modal
 *
 * A modal dialog on the native `<dialog>` element: it traps focus, makes the
 * rest of the page inert, closes on Esc or a click outside the panel, and
 * gives focus back to what had it when it closes. The dialog itself is a
 * transparent full-screen layer that lays out `children` (the panel).
 *
 * Mark the control that should get focus first with `data-autofocus`
 * (React's `autoFocus` does not work inside it).
 *
 * Shown while mounted; render it conditionally. `CommandProvider` treats an
 * open modal (`:modal`) as a reason to suspend single-key shortcuts.
 *
 * @param className - Layout of the layer around the panel and its backdrop color; centers it with padding by default.
 */
export function Modal({
  label,
  onClose,
  className = "items-center justify-center p-4 backdrop:bg-black/50",
  children,
}: {
  /** Accessible name of the dialog. */
  label: string;
  /** Esc, a click outside the panel, or the browser closing the dialog. */
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Captured on the first render, before the dialog takes focus.
  const [opener] = useState(() => (typeof document === "undefined" ? undefined : document.activeElement));
  const unmounting = useRef(false);
  const pressedOutside = useRef(false);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    unmounting.current = false;
    if (!element.open) element.showModal();
    // `showModal` focuses the first focusable element. React's `autoFocus` runs while the dialog is still closed
    // (and its content unfocusable), so a child marks the control to start on with `data-autofocus` instead.
    element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      unmounting.current = true;
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      className={`fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent text-zinc-900 open:flex dark:text-zinc-100 ${className}`}
      onCancel={(event) => {
        // React decides when the dialog goes away; Esc only asks.
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // The browser may close it on its own (e.g. a repeated Esc); keep React in step. A close the effect cleanup
        // made (unmounting, or Strict Mode re-running the effect, which reopens it) is not the user's.
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      // A click counts as outside only when it also started outside, so selecting text in the panel never closes it.
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
