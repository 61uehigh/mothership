import { useState, type DragEvent } from "react";

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
