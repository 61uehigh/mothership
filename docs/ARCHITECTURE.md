# Architecture

mothership is one Next.js app: React screens and API routes in the same TypeScript project, with a Node server that runs agents, talks to MCP servers, and calls local CLIs (`git`, `gh`, `docker`). The code is organized by feature, and dependencies point one way.

## Layout

```text
src/
  app/            Next routes only: pages and thin API handlers (parse input → call a service → respond)
  composition/    server.ts: builds every server object once and wires them together; holds no feature logic
  features/
    sessions/     agents, the turn loop, Claude and Codex adapters, import, git gate, questions, review
    tools/        Slack, Calendar, Linear, Nuclino, Notion: the sidebar widgets, search, and detail views
      <tool>/     each tool's source (server/) and screens (ui/)
    github/       pull requests (with Claude's review summary), issues, runs, and the repository list
    docker/       containers, logs, and actions
    kakaotalk/    notes to yourself through Kakao's API, opening the app, and (on a Mac) the chat list read from the app's window
    explorer/     browsing and previewing local files
    settings/     first-run setup, connections, and your profile
    inbox/        what needs you from every source, sorted by your rules and a daily Claude review
    meetings/     Claude's summaries of meeting notes from the Nuclino collections you choose
    todos/        your to-do list, kept in .mothership/todos.json
    youtube-music/ your YouTube playlists and liked songs (Data API, your Google sign-in) and the mini player that plays them
    insights/     your own use of the app: features, entry paths, active time
    feedback/     developer mode: feedback that becomes a session on mothership's own code, and the debug panel
    notifications/, usage/
  platform/       server infrastructure any feature may use: paths, MCP, git, CLI runner, HTTP errors,
                  one-shot JSON questions to Claude, saved per-version summaries, atomic file writes,
                  process-wide state, and Google OAuth client files
  shell/          what features build on in the browser: tabs, the shell context, commands, Markdown
  workbench/      the app frame that puts features on screen: sidebars, tab strip, palette, status bar
  ui/             shared UI kit: primitives, hooks, formatting
  lib/            pure helpers with no runtime of their own, usable from any layer (e.g. errorMessage)
```

Inside a feature:

| Folder    | Holds                                              | Runs in        |
| --------- | -------------------------------------------------- | -------------- |
| `model/`  | Types, schemas, and pure functions                 | browser and server |
| `server/` | Services, stores, and adapters                     | server only    |
| `ui/`     | React components and client hooks                  | browser only   |

## Dependency rules

`pnpm lint` checks these with `scripts/check-boundaries.mjs`.

- `app/` may use anything. Routes get stateful server objects (the runtime, services, caches) only from `composition/server.ts`; they may call a feature's stateless server functions directly.
- `composition/` may use `platform/` and features' `server/` and `model/`; only routes use it.
- A feature's `server/` uses its own code, `platform/`, and other features' `model/`, never another feature's `server/`. What one feature needs from another is passed in by the composition root.
- A feature's `ui/` uses its own code, `ui/`, `shell/`, and other features' `model/`, never another feature's `ui/` and never server code.
- `model/` uses only models.
- `shell/` uses `ui/` and feature models; `workbench/` adds feature UIs on top. Features never use `workbench/`.
- `platform/` and `ui/` use only themselves (and `lib/`).
- `lib/` uses only itself; everything may use it.

## How the principles show up

- **Single responsibility.** A class has one reason to change: `AgentStore` is one repository per table (`agents`, `messages`, `events`, `questions`, `tokens`), the runtime hands turns to `TurnScheduler`, worktrees to `WorktreeService`, and questions to `QuestionDesk`; the Explorer's secret-path policy, path checks, git listing, and highlighting each live in their own module.
- **Open for extension.** Adding a work tool means writing its `ToolSource` (load and search) and registering it in `features/tools/server/toolSources.ts`; the dashboard never changes. Agent backends work the same way through `ADAPTERS`, tabs and sections through `workbench/registry.tsx`, and Settings pages through `SETTINGS_PAGE_LIST` in `features/settings/ui/settingsPages.tsx`.
- **Substitutable implementations.** Every agent backend implements `AgentAdapter`; every tool source implements `ToolSource`; an MCP server and a claude.ai connector are both a `ToolCaller`.
- **Narrow interfaces.** Services take only what they use: Settings gets check functions and a small view of the sidebar, not the dashboard; the scheduler gets the tables it touches, not the whole store; features see the `Shell` contract, not the app frame.
- **Dependencies point inward.** Services receive their collaborators (configs, callers, hooks such as `onRateLimit`) through constructors; only `composition/server.ts` decides which concrete objects to use.

## State and singletons

Next can load a separate copy of a module for each route, and a dev reload loads another, so nothing that must be shared may live in a module-level variable:

- Services that hold state (the runtime, MCP connections, the Inbox review, meeting and PR summaries in progress, sign-ins in progress) live in one object on `globalThis` in `composition/server.ts`. Ones added later are made on first use with `shared(key, Class, make)`, which makes them again after a hot reload of their class.
- Caches, locks, and limits inside a feature's or platform's module use `processState(key, make)` from `platform/processState.ts`.
- Services without state are built fresh, so code changes apply without a restart.

## Files on disk

`platform/paths.ts` separates two places:

- **App root** (`MOTHERSHIP_APP_ROOT`, default: the project folder): scripts and the default config.
- **Data folder** (`MOTHERSHIP_DATA_DIR`, default: the project folder): your `config/`, `.env.local`, and `.mothership/` (the session database, worktrees, saved choices).

Config files are read from your copy in the data folder when it exists, else from the app's default. In development both are the project folder; a packaged app keeps data in Application Support.

## Desktop app

`electron/` wraps the same server: `pnpm app:build` (`electron/build.mjs`) builds Next as a standalone server into `.next-app`, adds the default config, a bundled copy of the agents' control script, and the Claude Code and Codex binaries, and packages them with `electron/main.mjs`. At launch, `main.mjs` starts the server with Electron's binary as Node (`ELECTRON_RUN_AS_NODE`), passes `MOTHERSHIP_APP_ROOT`, `MOTHERSHIP_DATA_DIR`, and the binaries' paths (`MOTHERSHIP_CLAUDE_PATH`, `MOTHERSHIP_CODEX_PATH`, read by `platform/agentBinaries.ts`), loads your saved keys, takes your login shell's `PATH`, and shows the server in a window. Code that reads files at run time marks its paths with `/*turbopackIgnore: true*/`, so the standalone build traces only what it imports.

## Conventions

### Files and folders

- A file is named after what it exports. **PascalCase** when it holds one class or React component of that name (`TodoStore.ts`, `SettingsTab.tsx`) or, in `model/`, a domain's types (`Settings.ts`, `Inbox.ts`). **camelCase** when it holds functions, hooks, or several small components (`github.ts`, `toolPane.tsx`, `settingsLayout.tsx`). Hooks alone in a file are `useX.ts`.
- A feature's folder is named as its URL segments are: lowercase, words joined with `-` (`youtube-music`, routes under `/api/youtube-music`). Ids that are saved in your data (section ids such as `youtubemusic`, command ids) keep their spelling.
- Tests sit next to the code as `name.test.ts`.

### Suffixes

| Suffix | Means |
| --- | --- |
| `Service` | A class a route calls for one feature's use cases; built by the composition root (`SettingsService`, `InboxService`, `MeetingsService`). |
| `Store` | A class that reads and writes one file or table (`TodoStore`, `SummaryStore`, `AgentStore`). |
| `Source` | A work tool's `ToolSource`: loading its sidebar widget and searching it (`slackSource.ts`). |
| `Api` | A module that calls one outside service's HTTP API directly (`slackApi.ts`, `kakaoApi.ts`, `youtubeApi.ts`). |
| `Adapter` | An agent backend behind `AgentAdapter`. |
| `Caller` | Something that calls MCP tools (`ToolCaller`, `connectorCaller`). |

### Errors

- A route answers errors as `{ error, code? }`. Throw `HttpError` (or a subclass) for anything a route should answer with a status other than 500; `errorResponse(error, otherStatus?)` maps it, and `toolFailure` gives the one status table for a work tool's failures (409 not set up, 404 not found, 429 rate limited, 502 otherwise).
- In the browser, call routes with `fetchJson` / `useJson`, which turn failures into values instead of rejections.
- `errorMessage(error)` from `lib/errors` turns anything caught into a message.

### Files on disk

Data-folder files are written with `writeFileAtomic` (a temporary file with a unique name, renamed into place) and changed one at a time through `writeQueueFor(file)`, one queue per file for the whole server, so two quick changes cannot drop each other. A read-change-write runs whole inside the queue.

### Comments

- Every export has a TSDoc block that starts with `### name`. The block says what the signature does not: why it exists, units, edge cases, what it throws. A block that would only repeat the name and types is left at the heading plus one line, not padded.
- Inside code, comments explain why: a workaround, a security reason, a constraint from an outside service. Comments that restate the code or tell the code's history are removed; history belongs in commit messages.

### Connection cards

Every card in Settings → Connections is built from the same pieces in `features/settings/ui`: `ConnectionShell` (icon, name, status chip, one line on what connecting gives you, Details), `SetupChecklist`/`SetupStep` (one short imperative line per step, a link to the exact page, ✓ once the app can tell it is done, `OptionalSteps` for the rest), `CopyValue`/`CopyButton` for values to paste elsewhere, and `ConnectedRow`/`DisconnectButton` once connected. A card shows only what its state needs: Connect before setup, the checklist during it, the account with Test and Disconnect after. Background, variable names, and raw errors go under Details. Chips use the words in `CHIP_LABELS`, and which steps are done is decided by pure functions in `model/connectionStatus.ts`, which are tested.

### Tests

Tests cover rules and failure handling: the request guard and secret paths, parsers of outside formats, sorting and bucketing rules, rate limits and write queues, sign-in and token refresh, failure classification, and anything that guards a bug that happened. Plain CRUD round trips, constants, and display-only mappings are not tested.
