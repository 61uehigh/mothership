// Docker data shared by the server (features/docker/server) and the UI.

/**
 * ### ContainerState
 *
 * Docker's lifecycle state of a container.
 */
export type ContainerState = "created" | "running" | "paused" | "restarting" | "removing" | "exited" | "dead";

/**
 * ### ContainerSummary
 *
 * One row of `docker ps -a`.
 */
export type ContainerSummary = {
  /** Full container id. */
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  /** Human status from Docker, such as "Up 7 hours (healthy)" or "Exited (137) 2 hours ago". */
  status: string;
  /** Published ports in short form, such as "8790→8790/tcp", or "5432/tcp" when not published. */
  ports: Array<string>;
  /** ISO 8601 creation time, or `undefined` when Docker's date could not be read. */
  createdAt: string | undefined;
  /** Compose project (`com.docker.compose.project` label), or `undefined` for a standalone container. */
  project: string | undefined;
  /** Compose service (`com.docker.compose.service` label). */
  service: string | undefined;
};

/**
 * ### ContainerMount
 *
 * A volume or bind mount of a container.
 */
export type ContainerMount = {
  /** `bind`, `volume`, `tmpfs`, … */
  type: string;
  /** Host path, or the volume name for a named volume. */
  source: string;
  destination: string;
  readOnly: boolean;
};

/**
 * ### ContainerDetail
 *
 * Summary of `docker inspect` for one container. Environment variables are
 * listed by name only; their values are never returned.
 */
export type ContainerDetail = {
  /** Full container id. */
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  /** `healthy`, `unhealthy`, or `starting` when the image defines a health check. */
  health: string | undefined;
  /** ISO 8601, or `undefined` when the container never started. */
  startedAt: string | undefined;
  /** ISO 8601, or `undefined` when the container never stopped. */
  finishedAt: string | undefined;
  exitCode: number;
  restartCount: number;
  ports: Array<string>;
  mounts: Array<ContainerMount>;
  /** Names of the environment variables set in the container. */
  envNames: Array<string>;
  networks: Array<string>;
  project: string | undefined;
  service: string | undefined;
  /** Entrypoint and command, joined with spaces. */
  command: string;
};

/**
 * ### ContainerLogs
 *
 * Recent output of a container.
 */
export type ContainerLogs = {
  /** stdout and stderr merged, each line prefixed with its timestamp. */
  text: string;
  /** Whether older lines were dropped to stay under the size cap. */
  truncated: boolean;
};

/**
 * ### CONTAINER_ACTIONS
 *
 * The only container commands mothership runs.
 */
export const CONTAINER_ACTIONS = ["start", "stop", "restart"] as const;

/**
 * ### ContainerAction
 *
 * One of {@link CONTAINER_ACTIONS}.
 */
export type ContainerAction = (typeof CONTAINER_ACTIONS)[number];

/**
 * ### DockerErrorCode
 *
 * Why a `docker` call failed:
 * - `missing`: the Docker CLI is not installed.
 * - `daemon`: the CLI is installed but the Docker daemon is not running.
 * - `failed`: anything else (invalid output, command error).
 */
export type DockerErrorCode = "missing" | "daemon" | "failed";
