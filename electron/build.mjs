// Builds the desktop app: a self-contained Next server, the agent CLIs it
// runs, and default config, packaged with Electron into dist/app.
//
//   pnpm app:build          the .app and a .dmg
//   pnpm app:build --dir    just the .app (faster, for trying it out)
//   pnpm app:install        just the .app, installed in /Applications and opened
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "resources");
const server = path.join(out, "server");
const install = process.argv.includes("--install");
const dirOnly = install || process.argv.includes("--dir");
const INSTALLED = "/Applications/Mothership.app";

/** Default config that ships with the app; your own copies live in Application Support. */
const DEFAULT_CONFIG = ["mcp.yaml", "roles.yaml", "dashboard.example.yaml", "repositories.example.yaml"];
/** Never part of the app: your settings, secrets, and data. */
const PRIVATE = [/(^|\/)\.env(?!\.example)/, /(^|\/)\.mothership(\/|$)/, /^server\/\.git(\/|$)/, /^server\/config\/(dashboard|repositories|keybindings)\.yaml$/];

function step(message) {
  console.log(`\n▸ ${message}`);
}

/**
 * The folder of an SDK's platform package (its native binary). pnpm links a
 * package's dependencies beside it, so look next to the SDK's real folder.
 */
function platformPackage(sdk, name) {
  const sdkDir = realpathSync(path.join(root, "node_modules", sdk));
  const dir = path.join(sdkDir, ...sdk.split("/").map(() => ".."), name);
  if (!existsSync(dir)) throw new Error(`${name} is not installed; run pnpm install on this Mac`);
  return realpathSync(dir);
}

function* walk(dir, base = dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    yield path.relative(base, full);
    if (lstatSync(full).isDirectory()) yield* walk(full, base);
  }
}

/** Quits a running installed app, which then stops its server and agents, and waits until it is gone. */
async function quitInstalled() {
  const binary = `${INSTALLED}/Contents/MacOS/Mothership`;
  const running = () => {
    try {
      execFileSync("pgrep", ["-f", binary], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  if (!running()) return;
  console.log("Quitting the running Mothership");
  execFileSync("pkill", ["-TERM", "-f", binary]);
  for (let waited = 0; running(); waited += 250) {
    if (waited > 15_000) throw new Error("Mothership did not quit; quit it with ⌘Q and run this again");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// The app is built for Apple Silicon; under Rosetta or on an Intel Mac the agent binaries would not match it.
if (process.arch !== "arm64") throw new Error(`Build on an Apple Silicon Mac with arm64 Node (this Node is ${process.arch}).`);

// The server build traces files under the project; an earlier app in dist/ must not end up inside the new one.
rmSync(path.join(root, "dist"), { recursive: true, force: true });

step("Building the Next server (standalone)");
if (!process.argv.includes("--skip-next")) {
  execFileSync("pnpm", ["exec", "next", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, MOTHERSHIP_APP_BUILD: "1" } });
}

step("Assembling dist/resources");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(root, ".next-app", "standalone"), server, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(root, ".next-app", "static"), path.join(server, ".next-app", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
mkdirSync(path.join(server, "config"), { recursive: true });
for (const file of DEFAULT_CONFIG) {
  // The committed default, not a local edit of it (which might hold your own settings).
  const committed = execFileSync("git", ["show", `HEAD:config/${file}`], { cwd: root, encoding: "utf8" });
  writeFileSync(path.join(server, "config", file), committed);
}

// Agents run this script as their mothership MCP server; bundled, it needs no node_modules.
await build({
  entryPoints: [path.join(root, "scripts", "control-mcp.mjs")],
  outfile: path.join(server, "scripts", "control-mcp.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});

const claude = platformPackage("@anthropic-ai/claude-agent-sdk", `@anthropic-ai/claude-agent-sdk-darwin-${process.arch}`);
mkdirSync(path.join(out, "bin"), { recursive: true });
cpSync(path.join(claude, "claude"), path.join(out, "bin", "claude"));
const codex = platformPackage("@openai/codex", `@openai/codex-darwin-${process.arch}`);
const codexVendor = path.join(codex, "vendor", process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin");
cpSync(codexVendor, path.join(out, "codex"), { recursive: true, verbatimSymlinks: true });

if (existsSync(path.join(server, "dist"))) throw new Error("dist/ was traced into the server; delete dist/ and .next-app/ and build again");
const leaked = [...walk(out)].filter((file) => PRIVATE.some((pattern) => pattern.test(file)));
if (leaked.length > 0) throw new Error(`Private files would ship in the app:\n${leaked.join("\n")}`);
for (const needed of ["server/server.js", "server/scripts/control-mcp.mjs", "bin/claude", "codex/bin/codex"]) {
  if (!existsSync(path.join(out, needed))) throw new Error(`Missing from the app: ${needed}`);
}

step(dirOnly ? "Packaging the .app" : "Packaging the .app and .dmg");
// The app's own folder holds only main.mjs and its package.json. It is staged outside the
// project: inside a pnpm workspace, electron-builder would copy the project's node_modules in.
const stage = mkdtempSync(path.join(tmpdir(), "mothership-app-"));
for (const file of ["main.mjs", "package.json"]) cpSync(path.join(root, "electron", file), path.join(stage, file));
const config = JSON.parse(readFileSync(path.join(root, "electron", "builder.json"), "utf8"));
// The Electron that was installed and tested here, not a version written down separately.
config.electronVersion = JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version;
config.directories = { app: stage, output: path.join(root, "dist", "app"), buildResources: path.join(root, "electron", "resources") };
config.files = ["main.mjs", "package.json"];
config.extraResources = [{ from: out, to: ".", filter: ["**/*"] }];
config.mac.icon = path.join(root, "electron", "resources", "icon.png");
writeFileSync(path.join(stage, "builder.json"), JSON.stringify(config));
try {
  execFileSync("pnpm", ["exec", "electron-builder", "--projectDir", stage, "--config", path.join(stage, "builder.json"), "--mac", ...(dirOnly ? ["--dir"] : [])], {
    cwd: root,
    stdio: "inherit",
  });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

if (install) {
  step(`Installing in ${INSTALLED}`);
  await quitInstalled();
  rmSync(INSTALLED, { recursive: true, force: true });
  // ditto keeps the app's symlinks, permissions, and signature intact.
  execFileSync("ditto", [path.join(root, "dist", "app", "mac-arm64", "Mothership.app"), INSTALLED], { stdio: "inherit" });
  execFileSync("open", [INSTALLED]);
  console.log(`\n✓ Installed: ${INSTALLED}`);
} else {
  console.log(`\n✓ Done: ${path.join("dist", "app")}`);
}
