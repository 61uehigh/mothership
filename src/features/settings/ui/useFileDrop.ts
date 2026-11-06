import { useState, type DragEvent } from "react";
import { OAUTH_CLIENT_MAX_BYTES } from "@/features/settings/model/Settings";

/**
 * ### OAUTH_CLIENT_TOO_LARGE
 *
 * Shown before uploading a file larger than any OAuth client file.
 */
export const OAUTH_CLIENT_TOO_LARGE = "That file is too large to be an OAuth client file.";

/**
 * ### isOAuthClientTooLarge
 *
 * Checked in the browser so a wrong file is refused before it is sent; the server checks again.
 */
export function isOAuthClientTooLarge(file: File): boolean {
  return file.size > OAUTH_CLIENT_MAX_BYTES;
}

/**
 * ### useFileDrop
 *
 * Lets a card take a dropped file while `enabled`, outlined while one is dragged over it.
 *
 * @returns Whether a file is over the card, and the handlers to spread on it.
 */
export function useFileDrop(enabled: boolean, onFile: (file: File | undefined) => void) {
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onDragOver: (event: DragEvent) => {
      if (!enabled) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: enabled
      ? (event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          onFile(event.dataTransfer.files[0]);
        }
      : undefined,
  };
  return { dragging, handlers };
}
