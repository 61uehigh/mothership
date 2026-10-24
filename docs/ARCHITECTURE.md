# Architecture

mothership is one Next.js app: React screens and API routes in the same TypeScript project, with a Node server that runs agents, talks to MCP servers, and calls local CLIs (`git`, `gh`, `docker`). The code is organized by feature, and dependencies point one way.

## Layout

```text
src/
  app/            Next routes only: pages and thin API handlers (parse input → call a service → respond)
  composition/    server.ts: builds every server object once and wires them together
  features/
    sessions/     agents, the turn loop, Claude/Codex/OpenAI adapters, import, git gate, questions, review
    tools/        Slack, Calendar, Linear, Nuclino: the sidebar widgets, search, and detail views
      <tool>/     each tool's source (server/) and screens (ui/)
    github/       pull requests, issues, runs, and the repository list
    docker/       containers, logs, and actions
    explorer/     browsing and previewing local files
    settings/     first-run setup, connections, and your profile
    notifications/, usage/
  platform/       server infrastructure any feature may use: paths, MCP, git, CLI runner, HTTP errors
  shell/          what features build on in the browser: tabs, the shell context, commands, Markdown
  workbench/      the app frame that puts features on screen: sidebars, tab strip, palette, status bar
  ui/             shared UI kit: primitives, hooks, formatting
```

Inside a feature:

| Folder    | Holds                                              | Runs in        |
| --------- | -------------------------------------------------- | -------------- |
| `model/`  | Types, schemas, and pure functions                 | browser and server |
| `server/` | Services, stores, and adapters                     | server only    |
| `ui/`     | React components and client hooks                  | browser only   |

## Dependency rules

`pnpm lint` checks these with `scripts/check-boundaries.mjs`.

- `app/` may use anything. Routes get server objects only from `composition/server.ts`.
- `composition/` may use `platform/` and features' `server/` and `model/`; only routes use it.
- A feature's `server/` uses its own code, `platform/`, and other features' `model/`, never another feature's `server/`. What one feature needs from another is passed in by the composition root.
- A feature's `ui/` uses its own code, `ui/`, `shell/`, and other features' `model/`, never another feature's `ui/` and never server code.
- `model/` uses only models.
- `shell/` uses `ui/` and feature models; `workbench/` adds feature UIs on top. Features never use `workbench/`.
- `platform/` and `ui/` use only themselves.

## How the principles show up

- **Single responsibility.** A class has one reason to change: `AgentStore` is one repository per table (`agents`, `messages`, `events`, `questions`, `tokens`), the runtime hands turns to `TurnScheduler`, worktrees to `WorktreeService`, and questions to `QuestionDesk`; the Explorer's secret-path policy, path checks, git listing, and highlighting each live in their own module.
- **Open for extension.** Adding a work tool means writing its `ToolSource` (load and search) and registering it in `features/tools/server/toolSources.ts`; the dashboard never changes. Agent backends work the same way through `ADAPTERS`, and tabs and sections through `workbench/registry.tsx`.
- **Substitutable implementations.** Every agent backend implements `AgentAdapter`; every tool source implements `ToolSource`; an MCP server and a claude.ai connector are both a `ToolCaller`.
- **Narrow interfaces.** Services take only what they use: Settings gets check functions and a small view of the sidebar, not the dashboard; the scheduler gets the tables it touches, not the whole store; features see the `Shell` contract, not the app frame.
- **Dependencies point inward.** Services receive their collaborators (configs, callers, hooks such as `onRateLimit`) through constructors; only `composition/server.ts` decides which concrete objects to use.

## State and singletons

Next can load a separate copy of a module for each route, and a dev reload loads another. Everything that holds state (the runtime, MCP connections, usage, notifications, caches) is kept in one object on `globalThis` in `composition/server.ts`, so all routes share it. Services without state are built fresh, so code changes apply without a restart.

## Files on disk

`platform/paths.ts` separates two places:

- **App root** (`MOTHERSHIP_APP_ROOT`, default: the project folder): scripts and the default config.
- **Data folder** (`MOTHERSHIP_DATA_DIR`, default: the project folder): your `config/`, `.env.local`, and `.mothership/` (the session database, worktrees, saved choices).

Config files are read from your copy in the data folder when it exists, else from the app's default. In development both are the project folder; a packaged app keeps data in Application Support.

## Desktop app

`electron/` wraps the same server: `pnpm app:build` (`electron/build.mjs`) builds Next as a standalone server into `.next-app`, adds the default config, a bundled copy of the agents' control script, and the Claude Code and Codex binaries, and packages them with `electron/main.mjs`. At launch, `main.mjs` starts the server with Electron's binary as Node (`ELECTRON_RUN_AS_NODE`), passes `MOTHERSHIP_APP_ROOT`, `MOTHERSHIP_DATA_DIR`, and the binaries' paths (`MOTHERSHIP_CLAUDE_PATH`, `MOTHERSHIP_CODEX_PATH`, read by `platform/agentBinaries.ts`), loads your saved keys, takes your login shell's `PATH`, and shows the server in a window. Code that reads files at run time marks its paths with `/*turbopackIgnore: true*/`, so the standalone build traces only what it imports.

