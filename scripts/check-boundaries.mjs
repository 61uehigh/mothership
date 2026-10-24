// Lists imports that break the dependency rules in docs/ARCHITECTURE.md.
// Usage: node scripts/check-boundaries.mjs   (exits 1 when it finds any)
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "src");
const IMPORT = /(?:import|export)\s[^"']*?from\s*["']@\/([^"']+)["']|import\(\s*["']@\/([^"']+)["']\s*\)|^import\s*["']@\/([^"']+)["']/gm;
/** Relative imports that leave a file's folder hide which area they reach into; use `@/` instead. */
const PARENT_IMPORT = /(?:from\s*|import\(\s*|^import\s*)["']\.\.\//m;

/** Where a module sits: its area, its feature (if any), and its layer inside the feature. */
function locate(rel) {
  const parts = rel.split("/");
  if (parts[0] === "features") return { area: "features", feature: parts[1], layer: parts.slice(2).find((p) => ["model", "server", "ui"].includes(p)) ?? "?" };
  if (parts[0] === "app" || parts[0].startsWith("proxy")) return { area: "app" };
  return { area: parts[0] };
}

/** Why `from` may not import `to`, or undefined when it may. */
function violation(from, to) {
  if (from.area === "app") return undefined;
  if (to.area === "composition" && from.area !== "composition") return "only routes use the composition root";
  switch (from.area) {
    case "composition":
      if (to.area === "platform" || to.area === "composition" || (to.area === "features" && to.layer !== "ui")) return undefined;
      return "the composition root builds server objects only";
    case "ui":
      return to.area === "ui" ? undefined : "shared UI may only use shared UI";
    case "platform":
      return to.area === "platform" ? undefined : "platform may only use platform";
    case "shell":
      if (["ui", "shell"].includes(to.area) || (to.area === "features" && to.layer === "model")) return undefined;
      return "shell may use shared UI and feature models only";
    case "workbench":
      if (["ui", "shell", "workbench"].includes(to.area) || (to.area === "features" && to.layer !== "server")) return undefined;
      return "workbench is client code: no server modules";
    case "features": {
      if (to.area === "app" || to.area === "workbench") return "features never use the app or the workbench";
      if (to.area !== "features") {
        if (from.layer === "model") return to.area === "ui" || to.area === "shell" || to.area === "platform" ? "models stay free of UI and server code" : undefined;
        if (from.layer === "server") return to.area === "platform" ? undefined : "server code may use platform, not UI";
        return to.area === "platform" ? "UI never uses server code" : undefined;
      }
      if (to.layer === "model" && from.layer !== "?") return undefined;
      const same = to.feature === from.feature || to.feature === "tools" && from.feature === "tools";
      if (from.layer === "model") return "models may only use models";
      if (from.layer === "server") return to.layer === "ui" ? "server never uses UI" : same ? undefined : `server code reaches into ${to.feature}'s server`;
      if (from.layer === "ui") return to.layer === "server" ? "UI never uses server code" : same ? undefined : `UI reaches into ${to.feature}'s UI`;
      return undefined;
    }
  }
  return undefined;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

const found = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const from = locate(rel);
  if (PARENT_IMPORT.test(readFileSync(file, "utf8"))) found.push(`${rel} → ../\n    import with @/ instead of a relative path that leaves the folder`);
  for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
    const target = match[1] ?? match[2] ?? match[3];
    const why = violation(from, locate(target));
    if (why !== undefined) found.push(`${rel} → @/${target}\n    ${why}`);
  }
}
console.log(found.length === 0 ? "No boundary violations." : found.join("\n"));
process.exitCode = found.length === 0 ? 0 : 1;
