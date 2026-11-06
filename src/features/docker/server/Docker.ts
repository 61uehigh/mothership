import { z } from "zod";
import { docker, dockerJson, dockerJsonLines, dockerMergedOutput } from "@/features/docker/server/cli";
import type { ContainerSummary, ContainerDetail, ContainerLogs, ContainerAction } from "@/features/docker/model/Docker";

const LOG_CAP_BYTES = 1024 * 1024;
const PROJECT_LABEL = "com.docker.compose.project";
const SERVICE_LABEL = "com.docker.compose.service";

// --- Public shapes -------------------------------------------------------

/**
 * ### containerRefSchema
 *
 * Validates a container id or name from user input. Rejects anything that
 * could be read as a CLI flag.
 */
export const containerRefSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/, "Expected a container id or name");

// --- Docker output schemas ----------------------------------------------

const stateSchema = z.enum(["created", "running", "paused", "restarting", "removing", "exited", "dead"]);

const psLineSchema = z.object({
  ID: z.string(),
  Names: z.string(),
  Image: z.string(),
  State: stateSchema,
  Status: z.string(),
  Ports: z.string(),
  CreatedAt: z.string(),
  Labels: z.string(),
});

const portBindingSchema = z.object({ HostIp: z.string(), HostPort: z.string() });

const inspectSchema = z.array(
  z.object({
    Id: z.string(),
    Name: z.string(),
    Path: z.string(),
    Args: z.array(z.string()).nullable(),
    State: z.object({
      Status: stateSchema,
      ExitCode: z.number(),
      StartedAt: z.string(),
      FinishedAt: z.string(),
      Health: z.object({ Status: z.string() }).optional(),
    }),
    RestartCount: z.number(),
    Config: z.object({
      Image: z.string(),
      Env: z.array(z.string()).nullable(),
      Labels: z.record(z.string(), z.string()).nullable(),
    }),
    Mounts: z.array(z.object({ Type: z.string(), Source: z.string(), Destination: z.string(), RW: z.boolean(), Name: z.string().optional() })),
    NetworkSettings: z.object({
      Ports: z.record(z.string(), z.array(portBindingSchema).nullable()).nullable(),
      Networks: z.record(z.string(), z.unknown()).nullable(),
    }),
  }),
);

// --- Parsing helpers -----------------------------------------------------

/**
 * Parses `docker ps` labels (`k=v,k=v`). Values may themselves contain
 * commas (Compose lists its config files that way), so a segment that does
 * not start with `key=` continues the previous value.
 */
function parseLabels(raw: string): Map<string, string> {
  const labels = new Map<string, string>();
  let last: string | undefined;
  for (const segment of raw.split(",")) {
    const match = /^([A-Za-z0-9][A-Za-z0-9_.\-/]*)=([^]*)$/.exec(segment);
    if (match !== null) {
      last = match[1];
      labels.set(match[1], match[2]);
    } else if (last !== undefined) {
      labels.set(last, `${labels.get(last) ?? ""},${segment}`);
    }
  }
  return labels;
}

/** Turns Docker's "2026-10-19 15:15:54 +0900 KST" into ISO 8601. */
function parseDockerDate(raw: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})/.exec(raw);
  if (match === null) return undefined;
  const ms = Date.parse(`${match[1]}T${match[2]}${match[3]}:${match[4]}`);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** Inspect uses year 1 for "never". */
function parseInspectDate(raw: string): string | undefined {
  return raw === "" || raw.startsWith("0001-") ? undefined : raw;
}

/**
 * Shortens `docker ps` ports ("0.0.0.0:8790->8790/tcp, [::]:8790->8790/tcp")
 * to unique "8790→8790/tcp" entries.
 */
function shortPortsFromPs(raw: string): Array<string> {
  const ports = new Set<string>();
  for (const part of raw.split(",")) {
    const text = part.trim();
    if (text === "") continue;
    const published = /:(\d+(?:-\d+)?)->(.+)$/.exec(text);
    ports.add(published === null ? text : `${published[1]}→${published[2]}`);
  }
  return [...ports];
}

function shortPortsFromInspect(raw: Record<string, Array<{ HostIp: string; HostPort: string }> | null> | null): Array<string> {
  const ports = new Set<string>();
  for (const [containerPort, bindings] of Object.entries(raw ?? {})) {
    if (bindings === null || bindings.length === 0) ports.add(containerPort);
    else for (const binding of bindings) ports.add(`${binding.HostPort}→${containerPort}`);
  }
  return [...ports];
}

function quoteArg(arg: string): string {
  return /^[A-Za-z0-9_./:=@%+,-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

// --- Queries -------------------------------------------------------------

/**
 * ### listContainers
 *
 * Every container, running or not, as `docker ps -a` lists them.
 *
 * @throws {@link import("@/features/docker/server/cli").DockerError} When docker fails.
 */
export async function listContainers(): Promise<Array<ContainerSummary>> {
  const lines = await dockerJsonLines(["ps", "-a", "--no-trunc", "--format", "{{json .}}"], psLineSchema);
  return lines.map((line) => {
    const labels = parseLabels(line.Labels);
    return {
      id: line.ID,
      // Linked containers list several names; the first is the container's own.
      name: line.Names.split(",")[0] ?? line.Names,
      image: line.Image,
      state: line.State,
      status: line.Status,
      ports: shortPortsFromPs(line.Ports),
      createdAt: parseDockerDate(line.CreatedAt),
      project: labels.get(PROJECT_LABEL),
      service: labels.get(SERVICE_LABEL),
    };
  });
}

/**
 * ### findContainer
 *
 * Resolves a container id, unique id prefix (12+ characters), or name
 * against the current container list, so commands only ever target an
 * existing container.
 *
 * @returns The container, or `undefined` when none matches.
 * @throws {@link import("@/features/docker/server/cli").DockerError} When docker fails.
 */
export async function findContainer(ref: string): Promise<ContainerSummary | undefined> {
  const containers = await listContainers();
  const exact = containers.find((c) => c.id === ref || c.name === ref);
  if (exact !== undefined) return exact;
  if (ref.length < 12) return undefined;
  const byPrefix = containers.filter((c) => c.id.startsWith(ref));
  return byPrefix.length === 1 ? byPrefix[0] : undefined;
}

/**
 * ### inspectContainer
 *
 * @param id - A full id from {@link findContainer}.
 * @returns The container's {@link ContainerDetail}.
 * @throws {@link import("@/features/docker/server/cli").DockerError} When docker fails.
 */
export async function inspectContainer(id: string): Promise<ContainerDetail> {
  const [raw] = await dockerJson(["container", "inspect", "--", id], inspectSchema);
  if (raw === undefined) throw new Error(`docker inspect returned nothing for ${id}`);
  const labels = raw.Config.Labels ?? {};
  return {
    id: raw.Id,
    name: raw.Name.replace(/^\//, ""),
    image: raw.Config.Image,
    state: raw.State.Status,
    health: raw.State.Health?.Status,
    startedAt: parseInspectDate(raw.State.StartedAt),
    finishedAt: parseInspectDate(raw.State.FinishedAt),
    exitCode: raw.State.ExitCode,
    restartCount: raw.RestartCount,
    ports: shortPortsFromInspect(raw.NetworkSettings.Ports),
    mounts: raw.Mounts.map((m) => ({
      type: m.Type,
      source: m.Type === "volume" && m.Name !== undefined ? m.Name : m.Source,
      destination: m.Destination,
      readOnly: !m.RW,
    })),
    // Names only: values may hold secrets and must never leave the server.
    envNames: [...new Set((raw.Config.Env ?? []).map((entry) => entry.split("=", 1)[0] ?? entry))].sort(),
    networks: Object.keys(raw.NetworkSettings.Networks ?? {}),
    project: labels[PROJECT_LABEL],
    service: labels[SERVICE_LABEL],
    command: [raw.Path, ...(raw.Args ?? [])].map(quoteArg).join(" "),
  };
}

/**
 * ### containerLogs
 *
 * The last `tail` lines of the container's stdout and stderr, with
 * timestamps, capped at 1 MB (oldest lines dropped first).
 *
 * @param id - A full id from {@link findContainer}.
 * @throws {@link import("@/features/docker/server/cli").DockerError} When docker fails.
 */
export async function containerLogs(id: string, tail: number): Promise<ContainerLogs> {
  return dockerMergedOutput(["logs", "--tail", String(tail), "--timestamps", "--", id], LOG_CAP_BYTES);
}

/**
 * ### runContainerAction
 *
 * Starts, stops, or restarts a container.
 *
 * @param id - A full id from {@link findContainer}.
 * @throws {@link import("@/features/docker/server/cli").DockerError} When docker fails.
 */
export async function runContainerAction(id: string, action: ContainerAction): Promise<void> {
  await docker([action, "--", id]);
}
