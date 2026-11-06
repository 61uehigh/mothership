import { Play, RotateCw, Square } from "lucide-react";
import type { ContainerAction, ContainerState } from "@/features/docker/model/Docker";
import type { MessageKey } from "@/ui/i18n/messages";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### ACTION_LABEL
 *
 * Catalog key of the button text for each container action.
 */
export const ACTION_LABEL: Record<ContainerAction, Extract<MessageKey, `docker.action.${string}`>> = { start: "docker.action.start", stop: "docker.action.stop", restart: "docker.action.restart" };

/**
 * ### STATE_LABEL
 *
 * Catalog key of each container state's name.
 */
export const STATE_LABEL: Record<ContainerState, Extract<MessageKey, `docker.state.${string}`>> = {
  created: "docker.state.created",
  running: "docker.state.running",
  paused: "docker.state.paused",
  restarting: "docker.state.restarting",
  removing: "docker.state.removing",
  exited: "docker.state.exited",
  dead: "docker.state.dead",
};

const HEALTH_LABEL: Record<string, Extract<MessageKey, `docker.health.${string}`>> = {
  healthy: "docker.health.healthy",
  unhealthy: "docker.health.unhealthy",
  starting: "docker.health.starting",
};

/**
 * ### healthLabel
 *
 * @returns A container's health check state in the UI's language; an unknown one as Docker says it.
 */
export function healthLabel(t: Translate, health: string): string {
  return Object.hasOwn(HEALTH_LABEL, health) ? t(HEALTH_LABEL[health]) : health;
}

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
