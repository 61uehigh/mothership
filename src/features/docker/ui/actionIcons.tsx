import { Play, RotateCw, Square } from "lucide-react";
import type { ContainerAction } from "@/features/docker/model/Docker";

/**
 * ### ACTION_LABEL
 *
 * Button text for each container action.
 */
export const ACTION_LABEL: Record<ContainerAction, string> = { start: "Start", stop: "Stop", restart: "Restart" };

/**
 * ### ActionIcon
 *
 * Icon of a container action's button.
 */
export function ActionIcon({ action, size }: { action: ContainerAction; size: number }) {
  switch (action) {
    case "start":
      return <Play size={size} />;
    case "stop":
      return <Square size={size} />;
    case "restart":
      return <RotateCw size={size} />;
  }
}
