// Builds the desktop app: a self-contained Next server, the agent CLIs it
// runs, and default config, packaged with Electron into dist/app.
//
//   pnpm app:build          the .app and a .dmg
//   pnpm app:build --dir    just the .app (faster, for trying it out)
//   pnpm app:build --win    a Windows x64 installer (NSIS .exe); --win --dir just the unpacked app.
//                           Builds on this Mac or on Windows (.github/workflows/windows.yml): the
//                           Windows agent binaries are fetched from npm.
//   pnpm app:install        just the .app, installed in /Applications and opened; it
//                           waits for working sessions to finish before replacing the
//                           running app (--force stops them; --wait-minutes=N, default 30)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { describeRunning, parseWaitMinutes, runningInstalledSessions, waitUntilIdle } from "./installGuard.mjs";
import { isPrivateFile } from "./privateFiles.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "resources");
const server = path.join(out, "server");
const install = process.argv.includes("--install");
/** Build for Windows x64 instead of this Mac. */
const windows = process.argv.includes("--win");
const dirOnly = install || process.argv.includes("--dir");
const INSTALLED = "/Applications/Mothership.app";
const INSTALLED_BINARY = `${INSTALLED}/Contents/MacOS/Mothership`;
/** The installed app's data folder (Electron's userData for the product name). */
const INSTALLED_DATA = path.join(homedir(), "Library", "Application Support", "Mothership");
const force = process.argv.includes("--force");
const waitMinutes = parseWaitMinutes(process.argv, 30);

/** Default config that ships with the app; your own copies live in Application Support. */
const DEFAULT_CONFIG = ["mcp.yaml", "roles.yaml", "dashboard.example.yaml", "repositories.example.yaml"];
/** Fetched Windows packages, kept between builds. */
const WINDOWS_CACHE = path.join(root, "node_modules", ".cache", "mothership-win");

/**
 * Runs a package manager (pnpm, npm). On Windows these are .cmd scripts,
 * which Node starts only through the shell, so arguments with spaces are
 * quoted there.
 */
function runTool(command, args, options) {
  if (process.platform !== "win32") return execFileSync(command, args, options);
  return execFileSync(command, args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)), { ...options, shell: true });
}

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

/** The version of an installed package. */
function installedVersion(name) {
  return JSON.parse(readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
}

/**
 * A package for another platform, which pnpm leaves out on this Mac: fetched
 * once with `npm pack` (checked against the registry's integrity hash) and
 * unpacked into {@link WINDOWS_CACHE}.
 *
 * @returns The unpacked package folder.
 */
function fetchPackage(spec) {
  const folder = path.join(WINDOWS_CACHE, spec.replaceAll("/", "+"));
  const unpacked = path.join(folder, "package");
  if (existsSync(path.join(unpacked, "package.json"))) return unpacked;
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  console.log(`Fetching ${spec}`);
  const tarball = runTool("npm", ["pack", spec, "--pack-destination", folder, "--silent"], { encoding: "utf8" }).trim().split(/\r?\n/).at(-1);
  // A relative name in its own folder: GNU tar (Git for Windows) takes `C:` in a path for a remote host.
  execFileSync("tar", ["-xzf", tarball], { cwd: folder });
  rmSync(path.join(folder, tarball));
  return unpacked;
}

/** Every file and folder under `dir`, relative to `base`, with `/` on every OS. */
function* walk(dir, base = dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    yield path.relative(base, full).split(path.sep).join("/");
    if (lstatSync(full).isDirectory()) yield* walk(full, base);
  }
}

function installedAppRunning() {
  try {
    execFileSync("pgrep", ["-f", INSTALLED_BINARY], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Waits until no session in the running app is mid-turn, so replacing it cuts
 * nothing off; with --force, says which ones will be stopped instead.
 */
async function waitForIdleApp() {
  if (!installedAppRunning()) return;
  const check = () => runningInstalledSessions(INSTALLED_DATA);
  if (force) {
    const running = await check();
    if (running.length > 0) console.log(`--force: stopping ${running.length} working session(s); they can be continued after the update:\n${describeRunning(running)}`);
    return;
  }
  const result = await waitUntilIdle({
    check,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    timeoutMs: waitMinutes * 60_000,
    pollMs: 5_000,
    progressMs: 60_000,
    log: (line) => console.log(line),
  });
  if (!result.idle) {
    throw new Error(
      `Sessions are still working after ${waitMinutes} min:\n${describeRunning(result.running)}\nThe new app is built in dist/app. Run this again later, or with --force to stop them (they can be continued afterwards).`,
    );
  }
}

/** Quits a running installed app, which then stops its server and agents, and waits until it is gone. */
async function quitInstalled() {
  if (!installedAppRunning()) return;
  console.log("Quitting the running Mothership");
  // The app takes SIGTERM as a quit that needs no confirmation (see main.mjs).
  execFileSync("pkill", ["-TERM", "-f", INSTALLED_BINARY]);
  for (let waited = 0; installedAppRunning(); waited += 250) {
    if (waited > 20_000) throw new Error("Mothership did not quit; quit it with ⌘Q and run this again");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

if (windows && install) throw new Error("--install is for this Mac; on Windows, run the installer from dist/app instead.");
// The Mac app is built for Apple Silicon; under Rosetta or on an Intel Mac the agent binaries would not match it.
if (!windows && process.arch !== "arm64") throw new Error(`Build on an Apple Silicon Mac with arm64 Node (this Node is ${process.arch}).`);

// Say up front that the swap will wait, while the build goes on.
if (install && !force && installedAppRunning()) {
  const running = await runningInstalledSessions(INSTALLED_DATA);
  if (running.length > 0) {
    console.log(`${running.length} session(s) are working in Mothership:\n${describeRunning(running)}\nBuilding meanwhile; the app is replaced once they finish (--force stops them instead).`);
  }
}

// The server build traces files under the project; an earlier app in dist/ must not end up inside the new one.
rmSync(path.join(root, "dist"), { recursive: true, force: true });

step("Building the Next server (standalone)");
if (!process.argv.includes("--skip-next")) {
  runTool("pnpm", ["exec", "next", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, MOTHERSHIP_APP_BUILD: "1", MOTHERSHIP_TARGET_PLATFORM: windows ? "win32" : "darwin" } });
}

step("Assembling dist/resources");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(root, ".next-app", "standalone"), server, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(root, ".next-app", "static"), path.join(server, ".next-app", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
// The server build traces local config files (your own dashboard.yaml, …) into standalone; the app ships only the committed defaults.
rmSync(path.join(server, "config"), { recursive: true, force: true });
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

mkdirSync(path.join(out, "bin"), { recursive: true });
if (windows) {
  const claude = fetchPackage(`@anthropic-ai/claude-agent-sdk-win32-x64@${installedVersion("@anthropic-ai/claude-agent-sdk")}`);
  cpSync(path.join(claude, "claude.exe"), path.join(out, "bin", "claude.exe"));
  const codex = fetchPackage(`@openai/codex@${installedVersion("@openai/codex")}-win32-x64`);
  cpSync(path.join(codex, "vendor", "x86_64-pc-windows-msvc"), path.join(out, "codex"), { recursive: true });
  const links = unlinkServer();
  replaceSharp(links);
  writeFileSync(path.join(out, "server-links.json"), JSON.stringify(links, undefined, 1));
  cpSync(path.join(root, "electron", "resources", "icon.png"), path.join(out, "icon.png"));
} else {
  const claude = platformPackage("@anthropic-ai/claude-agent-sdk", `@anthropic-ai/claude-agent-sdk-darwin-${process.arch}`);
  cpSync(path.join(claude, "claude"), path.join(out, "bin", "claude"));
  const codex = platformPackage("@openai/codex", `@openai/codex-darwin-${process.arch}`);
  const codexVendor = path.join(codex, "vendor", "aarch64-apple-darwin");
  cpSync(codexVendor, path.join(out, "codex"), { recursive: true, verbatimSymlinks: true });
}

if (existsSync(path.join(server, "dist"))) throw new Error("dist/ was traced into the server; delete dist/ and .next-app/ and build again");
const leaked = [...walk(out)].filter(isPrivateFile);
if (leaked.length > 0) throw new Error(`Private files would ship in the app:\n${leaked.join("\n")}`);
const binaries = windows ? ["bin/claude.exe", "codex/bin/codex.exe"] : ["bin/claude", "codex/bin/codex"];
for (const needed of ["server/server.js", "server/scripts/control-mcp.mjs", ...binaries]) {
  if (!existsSync(path.join(out, needed))) throw new Error(`Missing from the app: ${needed}`);
}

if (windows) {
  const darwinOnly = [...walk(server)].filter((file) => /(^|\/)[^/]*darwin[^/]*$/.test(file) && lstatSync(path.join(server, file)).isDirectory());
  if (darwinOnly.length > 0) throw new Error(`Mac-only packages would ship in the Windows app:\n${darwinOnly.join("\n")}`);
}

step(windows ? (dirOnly ? "Packaging the Windows app" : "Packaging the Windows installer") : dirOnly ? "Packaging the .app" : "Packaging the .app and .dmg");
/** The app's own folder: the main process, the modules it imports, and its package.json. */
const APP_FILES = ["main.mjs", "platform.mjs", "dialogText.mjs", "package.json"];
// Staged outside the project: inside a pnpm workspace, electron-builder would copy the project's node_modules in.
const stage = mkdtempSync(path.join(tmpdir(), "mothership-app-"));
for (const file of APP_FILES) cpSync(path.join(root, "electron", file), path.join(stage, file));
const config = JSON.parse(readFileSync(path.join(root, "electron", "builder.json"), "utf8"));
// The Electron that was installed and tested here, not a version written down separately.
config.electronVersion = JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version;
config.directories = { app: stage, output: path.join(root, "dist", "app"), buildResources: path.join(root, "electron", "resources") };
config.files = APP_FILES;
config.extraResources = [{ from: out, to: ".", filter: ["**/*"] }];
config.mac.icon = path.join(root, "electron", "resources", "icon.png");
config.win.icon = path.join(root, "electron", "resources", "icon.png");
writeFileSync(path.join(stage, "builder.json"), JSON.stringify(config));
try {
  runTool("pnpm", ["exec", "electron-builder", "--projectDir", stage, "--config", path.join(stage, "builder.json"), ...(windows ? ["--win", "--x64"] : ["--mac"]), ...(dirOnly ? ["--dir"] : [])], {
    cwd: root,
    stdio: "inherit",
  });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

/**
 * Takes pnpm's symlinks out of the server, which the installer cannot carry,
 * and returns them so the app makes them again as directory junctions on
 * Windows (see `prepareServer` in electron/platform.mjs). Paths are relative
 * to the server folder, with `/`.
 *
 * @returns Each link and the folder it points to.
 */
function unlinkServer() {
  const links = [];
  for (const file of [...walk(server)]) {
    const full = path.join(server, file);
    if (!lstatSync(full).isSymbolicLink()) continue;
    const target = path.relative(server, path.resolve(path.dirname(full), readlinkSync(full)));
    if (target.startsWith("..") || !statSync(full).isDirectory()) throw new Error(`Unexpected link in the server: ${file} → ${target}`);
    links.push({ link: file, target: target.split(path.sep).join("/") });
    rmSync(full);
  }
  return links;
}

/**
 * The server's image optimizer (sharp) was traced with this Mac's native
 * build; swap it for the Windows one of the same version, and drop the links
 * to the Mac one. Built on Windows, the traced one is already right.
 *
 * @param links - From {@link unlinkServer}; changed in place.
 */
function replaceSharp(links) {
  const pnpmDir = path.join(server, "node_modules", ".pnpm");
  for (const name of readdirSync(pnpmDir)) {
    if (/^@img\+sharp-(libvips-)?darwin-/.test(name)) rmSync(path.join(pnpmDir, name), { recursive: true, force: true });
  }
  links.splice(0, links.length, ...links.filter((entry) => !/darwin/.test(entry.link)));
  const sharpDir = readdirSync(pnpmDir).find((name) => name.startsWith("sharp@"));
  if (sharpDir === undefined) return;
  const windowsSharp = `node_modules/.pnpm/${sharpDir}/node_modules/@img/sharp-win32-x64`;
  if (links.some((entry) => entry.link === windowsSharp) || existsSync(path.join(server, windowsSharp))) return;
  const sharp = links.find((entry) => entry.link === `node_modules/.pnpm/${sharpDir}/node_modules/sharp`)?.target ?? `node_modules/.pnpm/${sharpDir}/node_modules/sharp`;
  const version = JSON.parse(readFileSync(path.join(server, sharp, "package.json"), "utf8")).version;
  cpSync(fetchPackage(`@img/sharp-win32-x64@${version}`), path.join(pnpmDir, sharpDir, "node_modules", "@img", "sharp-win32-x64"), { recursive: true });
}

if (install) {
  step(`Installing in ${INSTALLED}`);
  await waitForIdleApp();
  await quitInstalled();
  rmSync(INSTALLED, { recursive: true, force: true });
  // ditto keeps the app's symlinks, permissions, and signature intact.
  execFileSync("ditto", [path.join(root, "dist", "app", "mac-arm64", "Mothership.app"), INSTALLED], { stdio: "inherit" });
  execFileSync("open", [INSTALLED]);
  console.log(`\n✓ Installed: ${INSTALLED}`);
} else {
  console.log(`\n✓ Done: ${path.join("dist", "app")}`);
}
