# mothership roadmap

**Goal**: See scattered work tools (Nuclino, Linear, Slack, Google Calendar) on one screen, and hand off whatever needs doing to an agent right there.

## Phase 1: Agent sessions (done)
- An agent is a long-lived session, stored in SQLite (`.mothership/mothership.db`).
- Conversations continue through each provider's session id: Claude `resume`, Codex `resumeThread`, OpenAI `previous_response_id`.
- Agent graph plus a conversation panel, updated live over SSE.

## Phase 2: Unified dashboard (done)
- **Home** was a dashboard with these widgets (since Phase 6 they live as sections in the two sidebars):
  - Today (Calendar): the current and next meeting are highlighted; meeting links open directly.
  - My Linear issues: in-progress and not-started issues assigned to you, with urgent and overdue ones highlighted.
  - Slack mentions & DMs: from the last 48 hours.
  - Recent Nuclino docs: recently changed documents.
  - Agents: working, failed, and stopped agents first.
- **Each widget picks its data source** (`via`):
  - `mcp`: calls an MCP server from `mcp.yaml` directly, with no LLM involved, so it is fast and free. Linear and Nuclino use this with API keys.
  - `claude-connector`: relays through a connector you already connected in claude.ai, using a short Haiku session. No app, OAuth setup, or admin approval is needed, but each call uses about $0.007 of Claude usage. Slack and Calendar use this, cached for 10 minutes.
- Results are cached per widget on the server and refreshed periodically; you can also refresh by hand.
- For tools turned off in `mcp.yaml`, Claude agents use the claude.ai connector instead (`claudeConnectors`). Codex and OpenAI agents cannot.
- Every item can be **opened in its own tool** or **handed off to an agent** (a new agent starts with the item as its first message).
- Widget types, order, and options are set in `config/dashboard.yaml`.
- **Shortcut foundation**: a command registry, the ⌘K command palette, search across all tools, and the `?` help.
- **Demo mode**: `pnpm dev:demo` uses an MCP server that imitates the four tools with made-up data (`scripts/demo-mcp.mjs`).
- Known limitations:
  - Slack search cannot tell read from unread, so the widget shows recent messages instead of unread ones.
  - Nuclino `list_items` returns at most 100 items per workspace, not in date order, so a recent document can be missed in a large workspace. "Documents that mention me" has no way to be queried and is on hold.
  - The connector relay needs a `claude` login (an `ANTHROPIC_API_KEY` will not do) and takes a few seconds per refresh.

## Phase 3: Agents working together (done)
- Every agent gets a `mothership` MCP server (`scripts/control-mcp.mjs` → `/api/control`, authenticated with a per-agent token): `list_roles`, `spawn_agent`, `message_agent`, `list_agents`, `get_agent`, `ask_human`, `set_status`, `add_link`.
- When a sub-agent, or an agent that received a message, finishes its turn, the result is **reported back automatically** to the agent that sent the work, which wakes up again. No polling. Reports and system messages never trigger reports of their own, so two agents cannot ping-pong forever.
- The first turn carries a mothership briefing: the agent's role, how to use the tools, and the rule that outward-facing actions need approval through `ask_human`.
- **Inbox** (`/inbox`, `G` → `I`, `N` for the next question, number keys to pick an option), a banner on every screen while a question waits, an Inbox widget on the dashboard, and answering directly in the agent panel. Closing a question without answering tells the agent so.
- Cards show the agent's status note, link tags, and "Needs you".
- Safety limits: 6 turns running at once, sub-agents 3 levels deep, 8 sub-agents per agent, 20 messages to the same agent per 10 minutes.
- Known limitations: OpenAI agents cannot reach local MCP servers, so they have no mothership tools. Whether Codex agents may use MCP tools without approval is unverified.

## Phase 4: Code work (done)
- Per-agent git worktrees (`.mothership/worktrees/`, branch `mothership/<name>-<id>`). The New agent dialog lets you pick the working folder (repository) and whether to use a worktree; the `code_worker` role uses one by default. Sub-agents work in their parent's repository.
- The **Changes** tab in the agent panel shows a diff per file. Select a line (`J`/`K`, `]`/`[` for the next or previous hunk), press `Enter` to comment, and **Send review** delivers the comments to the agent with file, line, and code.
- **Approve and merge** (`⇧A`) commits the agent's uncommitted work, merges it into the original branch with `--no-ff`, and cleans up the worktree and branch. It refuses when the original checkout is on another branch or has uncommitted changes, and aborts on conflicts. **Discard** (`⇧X`) deletes the worktree and branch.
- **Compare run**: give the same task to 2–5 agents such as Claude and Codex, each in its own worktree, and compare them side by side at `/compare`. Merging one discards the rest.
- Shortcut priority (`priority`): shortcuts inside a panel win over page shortcuts.
- Claude agents in a worktree can run shell commands (tests, builds) inside the OS sandbox: writes only inside the worktree, no network, and a command the sandbox cannot contain fails instead of running unsandboxed. Agents without a worktree have no shell.
- Known limitations: only the human can merge; agents have no tool for it. Sandboxed shells cannot install packages from the network.

## Phase 5: Day-to-day convenience (done)
- **Status bar** at the bottom of every screen: Claude 5-hour and weekly limits, Codex 5-hour and weekly limits, CPU, memory, the notification switch, and a clock. Claude numbers update whenever Claude runs (agents and the connector relay), and `↻` checks right away (one Haiku call, about $0.002). Codex numbers are read from the latest record in `~/.codex/sessions`. Numbers older than an hour are dimmed.
- **Browser notifications**: while you are not looking at the tab, a question, or an agent you created finishing or failing, shows a desktop notification. Clicking it opens the relevant screen.
- **Open the working folder**: Terminal and Editor buttons in the agent panel, and `T` (Terminal) / `E` (VS Code) on the Agents screen. Only that agent's own folder can be opened.
- **Custom shortcuts**: on the `?` screen, click a shortcut and press new keys; conflicts are flagged, and you can disable a shortcut or restore its default. Saved to `config/keybindings.yaml`.
- **Mobile**: compact header and status bar; dashboard cards fit the screen width.
- Known limitations: browser notifications need permission, so they were not tested automatically. Instead of an embedded terminal, the macOS Terminal app is opened.

## Phase 6: Workbench layout (done)
- **Everything on one screen**: the left sidebar stacks Sessions, GitHub, and Docker; the right sidebar stacks Calendar, Slack, Linear, and Nuclino. Each section title carries the app's icon (a line icon for Sessions, Explorer, and Nuclino), folds the section, and opens it full size in the center from its expand button. The center stays empty until you pick something; a tab's details (a session's branch and merge actions, a pull request's checks) sit in a column beside it, folded by default and opened with the Details button at the right end of the tab bar. Which sections each sidebar shows, and in what order, is chosen in Settings → Sidebars (drag them between the left, right, and not-shown lists, or use the buttons); a side with nothing in it is hidden, and the Explorer can live in a sidebar too. Settings open from the title bar. Sidebar layout, widths, folded sections, and open tabs are remembered per browser.
- **Settings** open as a tab from the gear in the title bar (`⌘,`), and by themselves with a welcome note on a fresh install. A side menu switches between pages (Agents, Connections, Developer tools, Sidebars, You, Appearance), with an Open config folder button below it for the files behind the advanced settings; it marks the pages that need attention with a dot and remembers the last one; when the center is narrow, the menu becomes a row on top. The Agents and Developer tools pages give the next step when something isn't ready: log in to Claude, Codex, or GitHub in a Terminal window opened for you (or switch accounts), copy the install command, download Docker Desktop, or start Docker, then check again. They show which agents can run, whether the GitHub CLI and Docker are ready, your names, Slack member ID, and time zone, and how each work tool connects: its own MCP server with a token, a claude.ai connector, or off, with a test that loads the tool's section. Tokens go to `.env.local` and are never sent back to the browser; choices go to `.mothership/settings.json` and win over `config/mcp.yaml` and `config/dashboard.yaml` (except in demo mode). A section whose tool is not connected links to Settings.
- **Desktop app** (`pnpm app:build`): an Electron app for macOS that runs a self-contained build of the server with Electron's own Node, ships the Claude Code and Codex CLIs, keeps your data in Application Support, and opens on a fixed local port so browser-side settings persist. Built as an ad-hoc signed `.dmg`.
- **Installable app**: a web app manifest and generated PNG icons let Chrome (Install) and Safari (Add to Dock) open mothership in its own window with a Dock icon; `pnpm autostart install` adds a macOS LaunchAgent that starts the server at login.
- **Dark and light themes**, dark by default (Settings → Appearance), applied before first paint.
- **Command center** in the title bar (`⌘P`): open tabs, sessions, and files of the current folder, plus a search across tools from 3 characters. Prefixes: `>` commands (`⌘K`), `@` sessions, `#` all tools (`⌘⇧F`).
- **Tabs**: Session, Changes, Compare run, Agent graph, Inbox, File, Pull request, Nuclino doc, Linear issue, Slack message, Calendar event, Calendar (day and week), Docker container. A single click in a list opens a preview tab (italic) that the next preview replaces; a double click pins it, as in VS Code.
- **Sessions**: Claude Code-style list grouped by repository, sub-agents nested under the agent that created them, each with its model, branch, and status. The session tab is the conversation and composer; the right sidebar shows model, workspace (repository, branch, worktree), changes and merge actions, parent and sub-agents, and links.
- **Explorer** opens as a tab from the command center (`⌘P` → Open Explorer, or `G` → `E`). It browses your home folder like Finder: favorites (Home, Desktop, Documents, Downloads, and the repositories in `config/repositories.yaml`), a breadcrumb, hidden files on request, and buttons to open the folder in Finder, Terminal, or VS Code. A session's folder opens in it from **Browse** in the session details. Files open read-only in a viewer that fits their type: images (PNG, JPEG, GIF, WebP, SVG, …), PDFs, video, and audio are shown as they are; Markdown renders with a Preview/Source switch; text and code get syntax highlighting (Shiki) for both themes. Secrets are never shown: `.env` files (except `.env.example`), keys and certificates, `.netrc`, and folders such as `.ssh`, `.aws`, `.gnupg`, `.docker`, and `.config/gh`. Nothing outside the home folder can be reached.
- **GitHub** (through the logged-in `gh` CLI): your pull requests, review requests, assigned issues, and recent runs for the chosen repository, or **All repositories** for your pull requests, review requests, and assigned issues across GitHub. The list holds local checkouts (`config/repositories.yaml` first, then session folders, then the workspace) plus repositories added from your account or organizations; the gear adds or removes them (a removed local one can be restored; choices live in `.mothership/github-repos.json`). The chosen repository is remembered. A pull request tab shows the description, diff, and conversation; its sidebar shows checks and offers "Fix failing checks" and "Address review comments" hand-offs.
- **Docker** (through the local `docker` CLI): containers grouped by compose project with state, ports, and start / stop / restart (stop asks first). A container tab shows ports, mounts, networks, environment variable names (never values), and logs that can follow.
- **Questions from agents** sit at the top of Sessions under "Needs you"; the Inbox tab (the Sessions header button or `G` → `I`) also keeps answered ones.
- **Work tools**: Nuclino, Linear, Slack, and Calendar sections. Everything opens as a tab inside mothership: Nuclino docs and Linear issues with rendered Markdown and comments; Slack messages with their whole thread (the opened reply highlighted), files, and reactions; calendar events with time, meeting link, place, guests and their replies, and the description. Each tab links to its own app and can be handed off to an agent. Slack and Calendar details go through the claude.ai connector, so each is cached for ten minutes; the reload button fetches it fresh.
- **Acting from mothership**: reply in a Slack thread or send to the conversation (optionally also to the channel) and add emoji reactions; comment on a Linear issue, reply in a comment thread, and add or remove emoji reactions (reactions use Linear's GraphQL API with `LINEAR_API_KEY`, since the Linear MCP server has none); answer calendar invitations Yes / Maybe / No. Slack and Calendar actions go through the claude.ai connector relay, so each costs a little Claude usage; the Slack connector cannot remove reactions.
- **Mentions are highlighted** in Slack messages, Linear issues and comments, and Nuclino docs: other people in blue, you in amber. Slack mentions are matched by member id (`userId` on the slack widget), Linear ones by your username; Nuclino exports mentions as plain names, so your names from `me.names` in `config/dashboard.yaml` are highlighted wherever they appear.
- **Calendar day and week view** (`G` → `C`, or the button in the Calendar section): weeks start on Monday, with an all-day row, an hourly grid where overlapping events sit side by side, and a line at the current time. Declined events are struck through and unanswered invitations are dashed; a click opens the event.
- Each section header shows when its data was loaded next to the refresh button; the source note (for example, that a refresh uses a little Claude usage) is in the tooltip.
- Sessions can be **archived** (hidden in a collapsed Archived group; new work restores them) or **deleted** (history removed; an active worktree and its branch are discarded after a confirmation). Hover a session in the list, or use the session sidebar.
- Old links (`/agents?agent=`, `/inbox?q=`, `/compare?group=`) open the matching tab, so links from notifications keep working.
- Known limitations: files are read-only; `⌘W` and `⌘1–9` belong to the browser, so tabs close with `⌥W` and switch with `⌥[` / `⌥]`; images hosted inside Linear may not load because they need Linear authentication.

## Phase 7: Review hardening (done)
- **Request guard** (`src/proxy.ts`): only local hosts are answered (no DNS rebinding), and requests that change something must come from mothership's own pages, so other websites cannot send Slack messages, start agents, or read files through your browser.
- **Connector relay**: the relay forces the exact tool and arguments it was asked for, so text inside a message cannot redirect a call. Deadlines are passed down as cancellation; writes (send, reply, react, RSVP) are never cut off midway, and a timeout says the action may still have gone through.
- **Sub-agents** get no more than their parent: only the parent's MCP servers, and they work in the parent's folder (inside its worktree when it has one).
- **Agent runtime** split into a turn scheduler and a worktree service: stopping records "interrupted", merge/discard/delete never overlap a turn or each other, reports to retired agents are skipped, and one broken live-update subscriber no longer affects turns.
- **Secrets**: more credential files and shell histories are hidden from the Explorer.
- **UI**: one fetch hook that drops stale responses, shared modal (native dialog with focus handling), segmented controls and tabs usable from the keyboard, unsent replies kept across tab switches, Docker polling paused while folded or hidden.
- **Tests**: `pnpm test` (Vitest) for parsers, mentions, secret paths, and the request guard.

## Phase 8: Lead-centered sessions (done)
- **You start leads, not agents**: a new session asks only what should get done and in which folder. A lead (Claude, high effort) takes it on and creates the sub-agents the work needs, choosing each one's role, provider, and model (e.g. a Codex code worker in its own worktree, Claude for research, a fast GPT model for lookups). Role, provider, model, worktree, and compare runs are still under More options. Hand-offs from the sidebar start a lead too.
- **The session list shows only leads**, each with a summary of its team ("2 sub-agents, 1 working"); a question from any sub-agent marks its lead with "Needs you".
- **Claude's own sub-agents** (its Agent tool) are on too, and run in the foreground so they finish inside the lead's turn. mothership only reads them: they appear in the agent graph as dashed, read-only cards hanging off the agent that ran them (task, type, steps, the start of the report; live while they run), the session header's "Team" button opens the graph, and the conversation notes when each starts and finishes. They are Claude only and short-lived; for another provider, a worktree, or a session you can talk to, the lead uses `spawn_agent`.
- **Import a session** (the download button in Sessions): pick a recent Claude Code or Codex session from this Mac and continue it here as a lead. A Claude session is forked, so the original stays as it is in Claude Code; Codex cannot fork, so the same thread continues (don't use it in Codex at the same time). The earlier conversation, tool calls and results included, shows as read-only history above a note, and the first new turn gets mothership's briefing. Headless runs (mothership's own agents and connector relay) are left out of the list.
- **Each lead shows its team** as a live tree above the conversation (and in the details column): role, model, branch, current status note, and whether it needs you. Clicking a sub-agent opens its conversation, which links back to its lead.

## Phase 9: Seeing what agents do (done)
- **Tool cards** in the conversation, for Claude, Codex, and GPT alike: "Read src/features/sessions/model/Agent.ts", "Edit FileService.ts +3 −1", "Run pnpm test", "Slack · send message #general", "Start sub-agent fixer · code_worker". Each shows whether it worked; expanding it shows the input (a diff for edits) and what the tool returned (kept up to 4,000 characters). More than three calls in a row fold into "Used 7 tools: Read ×4, Edit ×2, Run" with the latest still visible.
- **Tools** in the details column: what the session can use (files and web, shell, Claude sub-agents, mothership collaboration, each MCP server, claude.ai connectors), dimmed with the reason when it can't, and how often it has used each.
- **Allow git** (per session, Claude only; in More options when starting one, or the session's details): plain `git` commands run in the session's folder outside the sandbox, so commits, history edits, fetch, and push work. Every push stops and asks you (Allow / Deny in "Needs you"); mothership enforces this itself, so the agent cannot skip it. To keep git from running anything else, commands may not be chained or redirected, options such as `-C`/`-c` and `git config` are refused, repository hooks are off, and files inside `.git` cannot be edited. Other shell commands stay blocked (or sandboxed in a worktree). Sub-agents never inherit it.
- Sessions without a worktree have no shell at all: Bash is removed from Claude's tools (for its sub-agents too), since Claude Code otherwise still ran commands it judged read-only.

## Keyboard shortcuts

### Principles
- **Every feature is a registered command**, and shortcuts, the command palette, and buttons all call the same command. A new feature shows up in the palette and gets its shortcut the moment it registers a command.
- **Works with any keyboard layout, including Korean input**: keys are matched by `event.code` (physical key position), not `event.key`, and key presses during IME composition (`isComposing`) are ignored.
- While a text field has focus, single-key shortcuts are off and only modifier combinations work.
- `mod` maps to ⌘ on macOS and Ctrl on Windows and Linux.
- Shortcuts are discoverable: in button tooltips, next to palette items, and in the `?` help.
- When the same key is bound in two places, the higher `priority` wins, then the most recently registered command.

### Current keymap
| Where | Keys | Action |
|---|---|---|
| Everywhere | ⌘P | Command center: tabs, sessions, files, tools |
| Everywhere | ⌘K / ⌘⇧P | Commands |
| Everywhere | ⌘⇧F | Search all tools (Linear, Slack, Nuclino, Calendar) |
| Everywhere | ? | Keyboard shortcuts (view and change) |
| Everywhere | C | New session |
| Everywhere | G → A / I / C | Open Agent graph / Inbox / Calendar |
| Everywhere | G → S / G | Unfold Sessions / GitHub |
| Everywhere | G → E | Open Explorer |
| Everywhere | G → T | Open Terminal in the active session's or file's folder (else the workspace) |
| Everywhere | ⌘B / ⌘⌥B | Toggle left / right sidebar |
| Everywhere | ⌥W | Close tab |
| Everywhere | ⌥[ / ⌥] | Previous / next tab |
| Everywhere | N | Next question waiting for you |
| Session | R | Write to the session |
| Session | ⌘. | Stop the running turn |
| Session | T / E | Open the session folder in Terminal / VS Code |
| Inbox | J / K | Next / previous question |
| Inbox | 1–6 | Answer with that option |
| Inbox | R | Write your own answer |
| Inbox | ⇧X | Close without answering |
| Changes | J / K, ] / [ | Next / previous line, next / previous hunk |
| Changes | Enter | Comment on the selected line |
| Changes | ⇧A / ⇧X | Approve and merge / discard |
| Compare | ← → (H / L) | Previous / next attempt |
| Compare | ⇧A / ⇧X | Merge / discard the selected attempt |

### Customizing
- Change a shortcut from `?`: click it and press the new keys (press two keys in a row for a sequence such as `G D`). Overrides are stored by command id in `config/keybindings.yaml`; an empty list disables a shortcut.
- Edits to the file take effect on the next page load.

### Planned, not built yet
- ⌘P: quickly jump to an agent by name or role.
- ⌘1–9: jump to pinned agents; `P` to pin.
- Graph navigation with arrow keys (parent, first child, siblings) and `⇧C` to create a sub-agent of the selected agent.
- In the message box: `↑` to recall the last message, `@` to mention an agent or role, and slash commands (`/model`, `/effort`, `/stop`, `/fork`).
- A Usage page (`G` → `U`).
