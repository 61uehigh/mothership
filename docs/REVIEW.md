# Code review, November 2026

This file records two reviews. The first one (below, up to its commit list) is a snapshot of the code at `404f863`; its file names and counts are as they were then. The second one is at the end.

## First review

A full review of mothership at `404f863` (298 tests), against SOLID, Clean Code and Refactoring, by five reviewers in parallel (composition/app/platform; tools/inbox/meetings; settings/YouTube Music/KakaoTalk/to-dos; sessions/GitHub/Docker/explorer; UI kit/shell/workbench/scripts/electron). The detailed notes, with line numbers against `404f863`, are in the session notes folder (`code-review/review-1-core.md` … `review-5-shell.md`); this file is the summary and what became of each finding.

Status: **Fixed** (the commits are listed at the end), **Listed** (needed a behavior or UX change; all were later approved and fixed, see below), **Left** (judged not worth the churn now, with the reason).

## Overall

The code was already in good shape: no `any`, few casts, strict layering with a checker, the `### name` TSDoc rule followed on ~98% of exports, and comments that mostly explain why. The problems were the kind fast feature work leaves behind: feature logic gathered in the composition root, shared state in module variables the architecture forbids, the same helpers written several times (often because the UI may not import server code), two long UI files, and naming that drifted per feature.

## By principle

### Single responsibility

| Finding | Status |
| --- | --- |
| `composition/server.ts` (663 lines) held the Inbox review scheduler, the meetings list and summaries, PR summaries, feedback, debug info, log tailing, connection-test mapping and the Calendar sign-in command, besides wiring. | **Fixed**: `InboxService`, `MeetingsService`, `PrSummaryService`, `FeedbackService`, `platform/serverLog`, `SettingsService` tests, `calendarSignInCommand`. Now 411 lines of wiring; what is left adapts one feature's data to another's port (Inbox inputs, the sidebar-to-Settings projection), which neither feature may import. |
| `SettingsTab.tsx` (572 lines): six inline components and a 190-line page switch. | **Fixed**: page registry, one file per page, `useSave`/`SaveStatus`. |
| `Workbench()` (340 lines, ~7 jobs). | **Fixed**: `TabStrip`, `SidebarResizer`, `useWorkbenchCommands`. |
| Routes calling MCP tools by name (`slack_send_message`, `slack_add_reaction`, `save_comment`). | **Fixed**. |
| The settings PATCH route held the whole merge; the keybindings route was a YAML store with its own queue. | **Fixed**: `applySettingsPatch` / `SettingsService.update` (with tests) and `keybindingsStore`. |
| Smaller route logic: the YouTube test sequence, compare rollback, the `import` route's Claude-only fork branch, control route role resolution. | **Left**: each is small, has one caller, and is covered by its route. |
| `SessionView.tsx` (384) and `NewAgentDialog.tsx` (341, 17 `useState`). | **Fixed**: split into hooks and parts; now 110 and 105 lines. |
| `buildInbox` grows by seven edits per new source. | **Left**: a source registry is worth it at the next source. |

### Open/closed

| Finding | Status |
| --- | --- |
| A Settings page needed edits in four places. | **Fixed**. |
| Agent provider rules hard-coded at ~12 sites (UI included). | **Fixed** for capabilities (git access, claude.ai connectors, local MCP servers): `AGENT_CAPABILITIES`. Left: importing sessions (Claude Code and Codex only, one switch in `sessionImport`) and Claude's usage events, which are about one product, not a capability. |
| Google Calendar special-cased by id in `ConnectionCard`, `SettingsService` and the failure classifier; KakaoTalk and YouTube Music cards wired by hand. | **Left**: needs per-connection setup components and a common test shape (the tones are now shared: behavior change 5). |
| A new tab kind needs five tables (`Tab` union, `tabKey`, zod schema, `TABS`, Insights labels). | **Left**: every one is an exhaustive `Record` or `switch`, so the compiler lists each place a new kind needs; merging them into one table would trade that for a large generic type. |
| Calendar branches on its flavor in six places; Notion picks its backend by the caller's label. | **Left**: a strategy per backend, chosen once from `widget.via`. |

### Liskov, interface segregation, dependency inversion

| Finding | Status |
| --- | --- |
| `notionSource` tells an MCP caller from a connector caller by its label, against the "callers are interchangeable" contract. | **Left** with the Calendar/Notion strategy item above. |
| `ToolCaller` text: the relay joins content blocks with `""`, the pool with `"\n"`. | **Left**: changing either changes what parsers see; needs a check per tool. |
| `TurnScheduler` imports `ADAPTERS` directly; `WorktreeService` takes the whole scheduler. | **Left**: low risk today. |
| Feedback, Inbox, Meetings and PR summaries now receive their collaborators (settings, the runtime, the Nuclino calls) from the composition root instead of importing them. | **Fixed**. |

### Duplication

| Finding | Status |
| --- | --- |
| Temp-file-and-rename written 10 times; serialized-write chains 6 times (two of them stayed rejected after one failure). | **Fixed**: `writeFileAtomic` (unique temporary names) and `writeQueueFor(file)`, one queue per file for the whole server; the Inbox review file now uses them too. |
| Single-flight maps written four times. | **Fixed**: `SingleFlight`. |
| `error instanceof Error ? … : String(…)` 29 times; non-HTTP error JSON in nine routes; the tool-failure status table twice. | **Fixed**: `lib/errors`, `errorResponse(error, otherStatus)`, `toolFailure`. |
| Two Google OAuth client-file parsers with different rules. | **Fixed**. |
| `makeItem` and three hand-off prompts copied into the UI. | **Fixed**. |
| `isSectionId` five times; settings storage key four times; tone colours three times. | **Fixed**. |
| Google sign-in UI (`GoogleSetup` vs `YouTubeMusicCard`): upload, drop, steps, sign-in step. Connection test hook and row twice. | Drop handling and the size check **Fixed** (`useFileDrop`). The steps were **Left** at first (the two cards differ in wording and flow: Calendar signs in through its MCP server, YouTube through mothership), then **Fixed** with the Connections redesign: both use `SetupChecklist`, `ChooseClientFile` and `SavedClientFile`; each keeps its own sign-in. |
| JSON request options spelled out in 22 browser calls. | **Fixed**: `jsonRequest`. |
| OAuth flows in `YouTubeMusicAuth` and `kakaoApi` (pending states, code exchange, refresh margin) and their callback pages. | **Left**: a `platform/oauth` module; two flows with different token shapes. |
| `slackApi` and `linearApi` are one HTTP client written twice; `gh` and Docker CLI wrappers are parallel. | HTTP **Fixed**: `postJson`, `envSecret`. The CLI wrappers already share `platform/cli`; what differs is each tool's error kinds and messages, which is theirs. |
| Claude message mapping in `sessionImport` and `ClaudeAdapter`. | **Left**: they already cut sub-agent output differently; merging changes import output. |
| Sessions UI makes 13 raw `fetch` calls, some fire-and-forget. | **Fixed** as behavior change 4. |

### Naming and conventions

| Finding | Status |
| --- | --- |
| No rule for file casing: classes in camelCase files, function modules in PascalCase files sharing names with models. | **Fixed** and written down in ARCHITECTURE.md → Conventions. |
| `youtubemusic` folder vs `youtube-music` routes. | **Fixed**: folder renamed; saved ids kept. |
| `McpRegistry.ts` loads config. | **Fixed**: `mcpConfig.ts`. |
| Store/Service/Source/Api/Auth suffixes meant different things. | **Fixed** as a convention (ARCHITECTURE.md); `YouTubeMusicAuth` and `GoogleSignIn` keep their names. |
| "Source" means four things; three "usage" modules. | **Left**: renames across many call sites for little gain. |

### State that must be shared

| Finding | Status |
| --- | --- |
| Module-level state the architecture forbids: meetings/PR summaries in progress, the relay's two-call limit, Nuclino's item cache and its disk copy, Slack user ids, GitHub caches. | **Fixed**: `shared()` in the composition root and `processState` in platform. |
| To-do changes and YouTube token-file changes raced (read, then write later). | **Fixed**, with a test for the to-dos. |

### Dead code, magic numbers, types

| Finding | Status |
| --- | --- |
| Unused exports (`ToolApiError`, `statusLabel`, `ActiveTime`, `LEFT_SECTIONS`/`RIGHT_SECTIONS`), an unreachable Intel branch, a parameter every caller passed as `() => false`. | **Fixed**. |
| Three readings of `MOTHERSHIP_DATA_DIR` disagreed on an empty value; the request guard exempted every path starting with `/api/control`. | **Fixed**. |
| Unchecked casts: OAuth client file, `SummaryStore` disk JSON, YouTube test error code, `UsageTracker`. | OAuth **Fixed**; the rest **Left** (files and values this app wrote itself). |
| Exports without a `### name` block (row mappers, `todoIdSchema`, `permissionProblem`, …). | **Fixed**. |

### Comments

Under 10% of TSDoc blocks only restated their signature. Stale ones (wrong sources listed, a renamed parameter, behaviour that changed, history told in prose, heading-only blocks) are fixed in the comments commit; the rule is in ARCHITECTURE.md → Conventions → Comments.

### Tooling and tests

| Finding | Status |
| --- | --- |
| `pnpm lint` linted every other session's worktree under `.claude/`. | **Fixed**. |
| No shared layer for pure helpers both UI and server may use, which caused several copies. | **Fixed**: `src/lib`, checked by `check-boundaries.mjs`. |
| Tests of plain CRUD, constants and display mappings. | **Fixed**: 302 → 246 cases, focused on rules and failure handling. |
| No tests for `TurnScheduler`, `AgentRuntime`, GitHub, workbench reducers. | **Left**: the important gap; the next tests to write. |
| `check-boundaries.mjs` skips tests, does not tell tool sub-features apart, and matches imports inside comments. | **Left**. |

## Behavior changes, approved and fixed

These needed a visible change, so they were listed for a decision first. All twelve were approved ("전부 고쳐줘") and are **Fixed**, one commit each (3 and 7 share one):

1. KakaoTalk's "Set up in Settings → Connections" opens Connections.
2. Linear comments and reactions refresh the Linear section and the Inbox's Linear notifications: `DETAIL_PREFIXES` covers every tool, and the notifications are cached under Linear's prefix.
3. "Today" for the Inbox and meeting summaries comes from the dashboard's time zone (Settings → You, else `dashboard.yaml`), as Calendar and Linear already did.
4. Failed requests show the server's message: inline where the control has room (reply, allow-git, question answer, review send, the new-session dialog), else in one notice stack (`ui/notices`, `NoticeStack`). `toolPane` shows the server's message instead of the status code.
5. One tone per failure cause (`problemTone`) and per sign-in state (`accountTone`) for every connection card; the Connections dot includes KakaoTalk and YouTube Music signed out or expired.
6. The meeting tab's Full note reads through the same cached, rate-limit-tolerant path as the summary (`/api/meetings/note`).
7. A failed or unconnected Calendar shows among the Inbox's problems, like Slack and Linear.
8. The agent tools list keys claude.ai connectors with `connectorServerName`, so names with `.` or `(` count their calls.
9. Streamed messages are kept in a store outside React state, passed through `LiveMessagesContext` and read with `useSyncExternalStore` (`useLiveMessages`), so a new message re-renders only the team graph and the compare view; the layout is saved once it settles instead of on every pixel of a drag.
10. Electron: each startup poll times out after 2 s, and each server's log closes when it exits.
11. `/api/compare` refuses backends that cannot edit files, naming the ones that can.
12. The git-access wording names the backends from `AGENT_CAPABILITIES` (`namesOf(kindsWith("gitAccess"))`).

## Review passes

Each pass is a fresh reviewer briefed as a strict lead, given the code and not these conclusions.

### Pass 1: FAIL

Must-fix, and what was done:

1. Write queues were per module copy, and two writes at once shared a temporary file. **Fixed**: `writeQueueFor(file)` in `processState`, unique temporary names.
2. The sessions UI and `toolPane` drop failed requests. **Listed**, then approved and **Fixed** (behavior change 4).
3. `inboxReview` wrote its file without the atomic write or queue. **Fixed**.
4. Settings PATCH merge and the keybindings store lived in routes. **Fixed**.
5. Settings rules (connection-test mapping, the Calendar sign-in command) in the composition root. **Fixed**; the cross-feature projections stay there by design.

Should-fix: `NewAgentDialog` and `SessionView` as god components (**Fixed**: split); the Settings registry not checked for completeness (**Fixed**: keyed by page id); two inline error messages left (**Fixed**); missing TSDoc headings (**Fixed**).

### Pass 2: FAIL

The splits and extractions from pass 1 were checked line by line and keep behavior. Must-fix, and what was done:

1. `SettingsPatch` and the route's zod schema were written separately. **Fixed**: one `settingsPatchSchema` in the model; the route adds only the folder checks.
2. `ChangesView.tsx` (343 lines) was a god component like `SessionView`. **Fixed**: `useWorktreeDiff`, `useReviewCursor`, `useReviewComments`, `reviewMessage`, `DiffFileSection`, `ReviewFooter`; now 100 lines.
3. Compare runs still left openai out by name. **Fixed**: an `editsFiles` capability. Refusing such attempts in `/api/compare` and rewording "Claude sessions only" were **Listed**, then approved and **Fixed** (behavior changes 11, 12).

Should-fix: duplicates the splits left (`stopTurn`, `agentModelLabel`, `isNotARepo`), two writes outside their file's queue (the Nuclino cache, the OAuth client file), `envSecret` in the wrong file, and a comment carried into the wrong hook. All **Fixed**.

### Pass 3: PASS

No must-fix findings. The ChangesView split, `settingsPatchSchema`, `editsFiles`, the shared session helpers, the queued writes and `envSecret` were checked against their parents and keep behavior. Minor items: the compare note's wording assumed one excluded backend and the `isSet` helper was written twice (**Fixed**); `CommandPalette.tsx` (~250 lines, 5 `useState`, 4 effects) is the next split candidate, with `usePaletteSearch` and a pure `paletteRows` (**Left**: below the size of the components split here). The reviewer agreed with every deferral and suggested approving the dropped-errors change (item 4 below) first: `useNewAgentChoices` and `useRepoProbe` read `/api/roles` and `/api/repositories` without checking the status, so a failed request can break the dialog.

### Review of the behavior changes: FAIL, then PASS

The first review of the twelve commits found that the message split still re-rendered the whole workbench (messages were still React state in `AppShell`) and that `SessionInfo`, unkeyed, carried one session's allow-git error to the next. Both were fixed, along with four smaller items: a write that succeeded could answer an error if refreshing failed, an empty folder field showed a red hint, the notice region was not in the page while empty, and the compare-run rule had no test. The second review passed with no findings.

## Rebased onto Settings → Usage and This Mac

The branch was rebased onto `412c888` (Settings → Usage and This Mac, status-bar click-throughs, palette commands). Its two pages are entries in the Settings page registry, in `settings/ui/pages/UsagePage.tsx` and `SystemPage.tsx`; its `settingsPage.ts` merged into `shell/settingsPage.ts`, so `openSettingsPage` and one storage key serve the status bar, the palette, and the tool panes; its General and Developer links and the time zone hint live in their page files; "Open usage" and "Open system" are in `useWorkbenchCommands`; `SystemMonitor` is made with `shared()`. Its tests are kept, and a focused `slackManifest` test is back (the manifest's scopes and MCP settings are rules). 274 tests.

## Commits of the first review

The branch's commits, oldest first (`git log --reverse --oneline main..claude/code-review`).

- chore: keep other sessions' worktrees out of ESLint
- refactor: share one atomic file write and write queue across the data-folder stores
- refactor: move developer feedback and debug info out of the composition root
- refactor: move the Inbox, Meetings and PR summary logic into feature services
- refactor: change the to-do list in one read-change-write step
- refactor: one error message helper and one tool-failure status table
- refactor: change the YouTube sign-in file one step at a time
- test: keep the tests on rules and failure handling, drop the trivial ones
- refactor: keep MCP tool names out of the Slack and Linear write routes
- chore: remove dead code and tighten two environment checks
- refactor: name files after what they export, and match YouTube Music's folder to its routes
- refactor: split Settings into a page registry with one file per page
- refactor: split the Workbench frame into its tab strip, resizer and commands
- refactor: read Google OAuth client files in one place for Calendar and YouTube Music
- refactor: share makeItem and the doc, page and issue hand-off prompts with the tool tabs
- refactor: keep shared caches and limits in one process-wide store
- refactor: one StatusChip for the connection cards
- fix: keep the status bar polling when the server does not answer
- docs: write down the conventions and the review's findings
- docs: fix stale comments and say more than the signature in thin TSDoc blocks
- refactor: one jsonRequest helper for the browser's JSON calls
- perf: return one live-agents object per change
- refactor: share the Google client file drop and size check between Calendar and YouTube Music
- fix: one write queue per file for the whole server, and unique temporary names
- refactor: merge a Settings change in the settings feature, not in its route
- refactor: keep the keybindings file in a store, not in its route
- refactor: move connection tests and the Calendar sign-in command out of the composition root
- refactor: key the Settings pages by id, and finish the error and TSDoc clean-ups
- docs: record review pass 1 and what changed for it
- refactor: one JSON POST with a timeout for the Slack and Linear APIs
- refactor: check an agent backend's capabilities, not its name
- refactor: split NewAgentDialog and SessionView into hooks and parts
- refactor: check git access by capability in the session screens too
- docs: update the review's statuses after the session screen split
- refactor: derive SettingsPatch from one zod schema
- refactor: choose compare-run backends by the editsFiles capability
- refactor: share stopTurn, agentModelLabel and isNotARepo in the session screens
- refactor: split ChangesView into hooks and parts
- fix: queue the Nuclino cache and OAuth client writes, and give envSecret its own file
- docs: record review pass 2 and what changed for it
- refactor: word the compare note for any number of backends, and share hasEnvSecret
- docs: record review pass 3 and list the branch's commits
- docs: give the meter thresholds and colours ### blocks like other exports
- test: bring back a focused test of the Slack app manifest
- docs: record the rebase onto Settings → Usage and This Mac
- fix: open Settings on Connections from the KakaoTalk section
- fix: count calls to claude.ai connectors with any characters in their name
- fix: name the backends that have git access instead of saying Claude
- fix: refuse compare-run attempts on backends that cannot edit files
- fix: use the dashboard's time zone for today in the Inbox and Meetings, and show Calendar failures in the Inbox
- fix: refresh the Linear section and the Inbox's notifications after a Linear write
- fix: colour each connection failure the same on every card, and dot Settings for KakaoTalk and YouTube Music
- fix: read a meeting's full note through the same rate-limited, cached path as its summary
- fix: time out the desktop app's startup poll and close each server's log
- fix: show the requests that fail instead of dropping them
- perf: keep streamed messages out of the shell context, and save the layout once it settles
- docs: move the twelve approved behavior changes to Fixed
- perf: keep streamed messages in a store of their own, so only their readers re-render
- fix: give each session's details column its own state
- fix: never fail a write that already happened, and tidy three error displays
- docs: record the behavior-change reviews and list the branch's commits

## Second review, after the restack

The second review ran on the restacked history (42 commits), with the same brief plus the testing rule: unit tests only for logic that is easy to get wrong, and code shaped so that logic is pure. The notes, with line numbers, are in the session notes folder (`code-review-2/r2-*.md` for the five areas, `final-*.md` for the closing reviews). Each round's fixes were made on a branch per area and folded into the commit that owns the changed lines (`git commit --fixup`, then an autosquash), so the history still tells one feature per commit.

### Round 1: bugs

Bugs found by area and fixed, among them: the Daily tab's times wrapping onto two lines, Explorer file links to `/private/tmp/…` refused because macOS's `/tmp` is a symlink (an absolute link is now checked by its real path against the home folder and the system's temp folders), screenshots written without the atomic write, and an expired Claude login in the Inbox review shown as a plain error instead of the log-in note.

### Round 2: structure, naming, comments, tests

- Decision logic moved out of components and services into pure, tested modules: the calendar day layout, the turn scheduler's start rule and usage math (`turnRules`), how the session timeline folds tool calls into runs, an import's fork-then-rollback, the Inbox month boundary.
- Server-written English replaced by codes the UI words in both languages: unavailable widgets in the Inbox and the connection test, Gmail and YouTube Music failures, OAuth client file problems, Linear and Slack key problems, to-do and note errors, desktop actions on an unsupported system.
- Duplicates merged: one date module (`lib/dates`), one `appName` and app opener, one missing-file check (`isMissingFile`), one HTML unescape (`lib/html`), one `storedLabel` for saved labels.
- Names: files cased by what they export, one name per thing (and different names for different things), the usage screens moved into the usage feature.
- Comments that restated code removed; tests that asserted constants or display mappings dropped.

### Closing reviews: FAIL, then round 3

Three fresh reviewers (server, client, cross-cutting) failed the result on: English still sent for coded failures (Gmail, YouTube Music, the Inbox's problems), two date modules left by parallel branches, error codes in three casings and an untyped `HttpError.code`, file names against the casing rule, untested layout and fold logic, and merge debris in `ARCHITECTURE.md`. Round 3 fixed all of them: every code is kebab case in `lib/apiErrorCodes.ts` and `HttpError.code` is typed `ErrorCode`; the conventions were deduplicated.

When a fixup no longer applied to its owner because a later commit had changed the same lines, it was folded into the later commit instead; 28 round-3 fixups went that way, most into the translation commit.

### Passes 4 to 24

After round 3, each pass was a fresh server reviewer and a fresh client reviewer, briefed only with the code and the conventions. Their notes are `code-review-2/pass4-*.md` … `pass12-*.md`. Each pass's fixes were made on a branch per area, checked, and folded into their owner commits like the rounds before; the history stayed at 42 commits throughout.

| Pass | Server | Client | Fixed, among others |
|---|---|---|---|
| 4 | FAIL (1 must, 4 should) | FAIL (7 should) | midnight an hour off on daylight-saving days east of UTC; Codex import list cut before filtering; codes for Explorer, Slack and Docker failures; compare run moved into the runtime; network failures and a stale connection test |
| 5 | FAIL (1 must, 3 should) | FAIL (4 should) | sessions created in a folder that doesn't exist; codes for runtime refusals; feature logic out of the composition root; untitled items worded when drawn; to-do writes that failed silently |
| 6 | FAIL (1 must, 3 should) | FAIL (3 should) | an imported session whose folder is gone; Meetings and Docker codes; a read error that could wipe saved summaries; gh failures worded |
| 7 | FAIL (1 must, 3 should) | FAIL (2 should) | Continue queued twice after a restart; messages queued at quit; a Codex session imported twice; one launcher for Codex; tool-tab failures worded through one function |
| 8 | FAIL (3 should) | FAIL (5 should) | sub-agents held while their worktree is merged or discarded; codes for Claude's own failures, timeouts and rate limits (no more matching English text); Google sign-in waits; silent mode-switch failures; a review sent twice |
| 9 | FAIL (1 should) | FAIL (2 should) | a Google sign-in back after ten minutes; feedback failures with other codes; a stale mode-switch alert |
| 10 | FAIL (1 should) | FAIL (3 should) | a suggested prompt left on a merged session; shortcuts with the Korean input source on; Daily's source names |
| 11 | PASS | FAIL (1 should) | an unknown time zone or Slack member ID worded |
| 12 | — (passed in 11) | FAIL (2 should) | readiness checks and Google sign-in failures worded from codes; quick Settings saves no longer lost or undone by an older answer |
| 13 | — | FAIL (5 should) | lead limits and merge refusals worded from codes; length limits shared by schema and input; Escape ignored while composing Korean; the save-order rules pulled out and tested |
| 14 | FAIL (2 should) | FAIL (2 should) | Google sign-in endings and a missing sidebar widget worded from codes; dialogs stay open while their request runs; the last input limits shared with their schemas |
| 15 | PASS | FAIL (3 should) | Docker logs, Slack and Linear timeouts ("check before trying again"), and failed-turn lines worded from codes |
| 16 | FAIL (3 should) | FAIL (3 should) | timeout classification pulled out and tested (a read timeout is not a send that may have gone through; a connect timeout is never one); section titles, a broken to-do file and untitled meeting collections worded in the UI's language |
| 17 | FAIL (1 should) | FAIL (2 should) | a broken to-do file answered with its code on every to-do route; a claude.ai connector that isn't connected worded with a fix link; one Korean mistranslation |
| 18 | FAIL (1 should) | FAIL (1 should) | how a claude.ai connector relay ended, classified and tested (slow vs. not connected vs. refused login or limit); a failed widget named by its worded title |
| 19 | FAIL (3 should) | FAIL (1 should) | a called connector tool stays "may have gone through" even when the SDK also throws; an overloaded Claude API is not a used-up limit; Claude's own rate limit no longer pauses the tool; Claude's refused login sends Fix to Agents |
| 20 | PASS | FAIL (1 must, 2 should) | feedback could not be sent with a long page error or label (the input is now built within the route's limits, tested); meeting collections' Fix follows the shared diagnosis; turning off prompt suggestions clears the stored ones |
| 21 | PASS | FAIL (1 should) | meeting collections stop at the limit the server takes, with a line saying so |
| 22 | — (passed in 20 and 21) | FAIL (5 should) | a compare-run name cut to its limit; a new to-do deleted during its first save stays deleted; three Korean labels matched to the screens they name; untitled Daily meetings worded |
| 23 | — | FAIL (5 should) | the status bar clock opens General, where the time zone now lives; adding a to-do ignores a second Enter; the Sessions pane's Delete dialog follows the live session; unused page labels dropped; the profile name minimum shared |
| 24 | — | FAIL (2 should) | Merge in the compare view follows one "can merge now" rule for button and shortcut; a meeting follow-up is fitted to the to-do schema before it is added |

Also fixed during these passes, at the user's request: a Codex MCP secret shared by name with another server is no longer put on Codex's command line (it goes through a small Node launcher that renames it, checked with a real Codex run); and the time zone now follows this computer unless one is chosen, in Settings → General instead of Profile.

### Left

- `CommandPalette.tsx` is still one component (the first review's candidate split); it is below the size of the components that were split.
- Windows and the Electron build were not run in this review; their code paths are checked by types and tests only. Worth a manual check there: the Node launcher that renames a shared Codex MCP secret (it starts `.cmd` commands such as `npx` through the shell, with arguments quoted by mothership), and Codex prompt prediction in a dev checkout without the native binary (it now falls back to `codex` on `PATH`).
- The loop was stopped at pass 24 by choice, not at a clean pass on both sides. The server side passed in passes 11, 15, 20 and 21; nothing must-fix was found after pass 20. The client side still turned up two to five should-fix items per pass, mostly rare paths (a request the screen could build that the server refuses, a dialog holding a stale snapshot, a Korean label that names a screen element differently), each fixed when found.
- Some new screen wording (the coded errors added in passes 4 to 24) was checked by types and tests, not looked at on screen in Korean.
