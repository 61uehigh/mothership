import path from "node:path";
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter } from "shiki";

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  mdx: "mdx",
  css: "css",
  scss: "scss",
  html: "html",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  graphql: "graphql",
  vue: "vue",
  svelte: "svelte",
  dockerfile: "dockerfile",
  ini: "ini",
  env: "dotenv",
  lua: "lua",
  dart: "dart",
  prisma: "prisma",
};

const NAME_LANGUAGES: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  ".gitignore": "ignore",
  ".npmrc": "ini",
};

function isBundledLanguage(language: string): language is BundledLanguage {
  return Object.hasOwn(bundledLanguages, language);
}

/**
 * ### guessLanguage
 *
 * @returns A Shiki language id for `file` from its name or extension, or `text`.
 */
function guessLanguage(file: string): string {
  const name = path.basename(file).toLowerCase();
  const byName = NAME_LANGUAGES[name] ?? (name.startsWith(".env") ? "dotenv" : undefined);
  const language = byName ?? EXTENSION_LANGUAGES[path.extname(name).slice(1)] ?? "text";
  return isBundledLanguage(language) ? language : "text";
}

let highlighter: Promise<Highlighter> | undefined;

/** One highlighter per server process; languages load on first use. */
function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: ["github-light", "github-dark"], langs: [] });
  return highlighter;
}

/**
 * ### highlight
 *
 * Highlights `code` for both themes with the language its file name suggests.
 *
 * @param file - The file's name or path, to pick the language.
 * @returns The language used and the highlighted HTML.
 */
export async function highlight(code: string, file: string): Promise<{ language: string; html: string }> {
  const language = guessLanguage(file);
  const shiki = await getHighlighter();
  if (language !== "text" && isBundledLanguage(language)) await shiki.loadLanguage(language);
  const html = shiki.codeToHtml(code, { lang: language, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
  return { language, html };
}
