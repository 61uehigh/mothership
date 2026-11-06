import { describe, expect, it } from "vitest";
import { maskSecretArgs } from "@/features/docker/server/maskSecretArgs";

describe("maskSecretArgs", () => {
  it("masks the value after a secret-looking flag", () => {
    expect(maskSecretArgs(["redis-server", "--requirepass", "hunter2", "--port", "6379"])).toEqual(["redis-server", "--requirepass", "•••", "--port", "6379"]);
  });

  it("masks a secret flag written with =", () => {
    expect(maskSecretArgs(["app", "--api-token=abc", "--verbose"])).toEqual(["app", "--api-token=•••", "--verbose"]);
  });

  it("masks NAME=value pairs with a secret name", () => {
    expect(maskSecretArgs(["postgres", "-c", "password=x", "-c", "max_connections=100"])).toEqual(["postgres", "-c", "password=•••", "-c", "max_connections=100"]);
  });

  it("masks the password in a URL", () => {
    expect(maskSecretArgs(["worker", "postgres://me:pw@db:5432/app"])).toEqual(["worker", "postgres://me:•••@db:5432/app"]);
  });

  it("does not swallow the next flag after a bare secret flag", () => {
    expect(maskSecretArgs(["app", "--no-auth", "--port", "80"])).toEqual(["app", "--no-auth", "--port", "80"]);
  });

  it("leaves an ordinary command alone", () => {
    expect(maskSecretArgs(["nginx", "-g", "daemon off;"])).toEqual(["nginx", "-g", "daemon off;"]);
  });
});
