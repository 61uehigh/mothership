import { describe, expect, it } from "vitest";
import { isSecretPath } from "@/features/explorer/server/secretPaths";

describe("isSecretPath", () => {
  it.each([
    "/Users/me/.ssh/id_ed25519",
    "/Users/me/.aws/config",
    "/Users/me/.config/gh/hosts.yml",
    "/Users/me/.git-credentials",
    "/Users/me/.claude/.credentials.json",
    "/Users/me/.zsh_history",
    "/Users/me/project/.env",
    "/Users/me/project/.env.local",
    "/Users/me/certs/server.pem",
    "/Users/me/.terraform.d/credentials.tfrc.json",
    ".vault-token",
    "/Users/me/.codex/auth.json",
    "/Users/me/.config/github-copilot/apps.json",
    "/Users/me/.zshrc",
    "/Users/me/.bash_profile",
    "/Users/me/project/.envrc",
    "/Users/me/project/.yarnrc.yml",
    "/Users/me/project/.git/config",
  ])("blocks %s", (target) => {
    expect(isSecretPath(target)).toBe(true);
  });

  it.each(["/Users/me/project/.env.example", "/Users/me/project/README.md", "src/Credentials.swift", "src/tokenizer.py", "history.ts", "/Users/me/project/.gitconfig.example", "/Users/me/project/config/zshrc.md"])(
    "allows %s",
    (target) => {
      expect(isSecretPath(target)).toBe(false);
    },
  );
});
