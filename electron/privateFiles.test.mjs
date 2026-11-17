import { describe, expect, it } from "vitest";
import { isPrivateFile } from "./privateFiles.mjs";

describe("isPrivateFile", () => {
  it.each([
    ".env.local",
    "server/.env",
    "server/.env.production.local",
    "server/.mothership",
    "server/.mothership/agents.db",
    "server/node_modules/pkg/.env",
    "server/.git/config",
    "server/config/dashboard.yaml",
    "server/config/repositories.yaml",
    "server/config/keybindings.yaml",
  ])("keeps %s out of the app", (file) => {
    expect(isPrivateFile(file)).toBe(true);
  });

  it.each(["server/.env.example", "server/config/mcp.yaml", "server/config/dashboard.example.yaml", "server/server.js", "server/node_modules/dotenv/lib/main.js", "server/src/.github/x"])(
    "ships %s",
    (file) => {
      expect(isPrivateFile(file)).toBe(false);
    },
  );
});
