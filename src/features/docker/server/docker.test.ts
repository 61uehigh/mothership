import { describe, expect, it } from "vitest";
import { parseDockerDate, parseLabels, shortPortsFromPs } from "@/features/docker/server/docker";

describe("parseLabels", () => {
  it("keeps a comma inside a value as part of that value", () => {
    const labels = parseLabels("com.docker.compose.project=app,com.docker.compose.project.config_files=/a/compose.yml,/a/override.yml,com.docker.compose.service=web");
    expect(labels.get("com.docker.compose.project.config_files")).toBe("/a/compose.yml,/a/override.yml");
    expect(labels.get("com.docker.compose.service")).toBe("web");
  });

  it("keeps an equals sign inside a value", () => {
    expect(parseLabels("cmd=a=b").get("cmd")).toBe("a=b");
  });

  it("reads an empty label list as no labels", () => {
    expect(parseLabels("").size).toBe(0);
  });

  it("drops text before the first key", () => {
    expect([...parseLabels(",stray,k=v")]).toEqual([["k", "v"]]);
  });
});

describe("parseDockerDate", () => {
  it("applies the offset Docker prints", () => {
    expect(parseDockerDate("2026-10-19 15:15:54 +0900 KST")).toBe("2026-10-19T06:15:54.000Z");
    expect(parseDockerDate("2026-10-19 15:15:54 -0230 NST")).toBe("2026-10-19T17:45:54.000Z");
  });

  it("reads an unrecognized date as unknown", () => {
    expect(parseDockerDate("")).toBeUndefined();
    expect(parseDockerDate("2026-10-19T15:15:54Z")).toBeUndefined();
    expect(parseDockerDate("2026-13-45 99:99:99 +0000 UTC")).toBeUndefined();
  });
});

describe("shortPortsFromPs", () => {
  it("lists a port published on IPv4 and IPv6 once", () => {
    expect(shortPortsFromPs("0.0.0.0:8790->8790/tcp, [::]:8790->8790/tcp")).toEqual(["8790→8790/tcp"]);
  });

  it("keeps port ranges and unpublished ports", () => {
    expect(shortPortsFromPs("0.0.0.0:8000-8001->8000-8001/tcp, 5432/tcp")).toEqual(["8000-8001→8000-8001/tcp", "5432/tcp"]);
  });

  it("reads no ports as an empty list", () => {
    expect(shortPortsFromPs("")).toEqual([]);
  });
});
