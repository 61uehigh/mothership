<p align="center">
  <img src="src/app/icon.svg" width="96" height="96" alt="mothership icon: a mothership beaming down a small ship">
</p>

<h1 align="center">mothership</h1>

A personal workspace for macOS. It puts your scattered work tools on one screen and lets you hand work to Claude or Codex agents right where you see it.

- See Slack, Google Calendar, Linear, Nuclino, Notion, GitHub, and Docker side by side.
- Start an agent session from anything on screen: a Slack thread, an issue, a to-do, a failing pull request.
- Get one Inbox of what needs you today, this week, and this month.
- Keep everything local: the app serves itself on your Mac and nothing leaves it except calls to the tools you connect.

## Contents

- [Install and update](#install-and-update)
- [First run](#first-run)
- [Features](#features)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Configuration files](#configuration-files)
- [Data and privacy](#data-and-privacy)
- [Development](#development)
- [Docs](#docs)
- [License](#license)

## Install and update

mothership is a macOS app for Apple Silicon. You build it on your own Mac, so macOS opens it without the warning it shows for downloaded apps. You need Node and pnpm.

```bash
git clone https://github.com/61uehigh/mothership.git
cd mothership
pnpm install
pnpm app:install
```

`pnpm app:install` builds the app, puts it in `/Applications` (quitting and replacing an older copy), and opens it.

To update, pull and install again. Your data stays.

```bash
git pull
pnpm app:install
```

Good to know:

- The app runs its own server, so you need no terminal once it is installed.
- It ships the Claude Code and Codex command-line tools. `git`, the GitHub CLI (`gh`), Docker, and Node for `npx`-started MCP servers come from your shell's `PATH`.
- Closing the window keeps the app and any running agents going. Quit with `⌘Q`.

## First run

Settings opens with a welcome note on first start. Open it later from the gear at the top right or `⌘,`.

**Agents.** You need at least one:

| Agent | Sign in with | Or |
| --- | --- | --- |
| Claude | a `claude` login (Log in to Claude) | `ANTHROPIC_API_KEY` |
| Codex | a ChatGPT login (Log in with ChatGPT) | `OPENAI_API_KEY` |

Pick your **default lead** (Claude or Codex) on the same page. The lead you start a session with becomes the new default.

**Connections → Local tools.** Settings checks that the GitHub CLI is logged in and Docker is running, and gives the next step when one isn't.

**Connections.** Each work tool has a card with a short checklist: one line per step, a link to the exact page, and a ✓ once the app can tell the step is done. Saving a token or signing in tests the connection at once and shows who it connects as.

| Tool | How it connects |
| --- | --- |
| Slack, Linear, Nuclino, Notion | Its own MCP server with your token, or a claude.ai connector you already connected |
| Google Calendar | Its MCP server with your own Google OAuth client (three Google Cloud steps, then Sign in with Google), or the claude.ai connector |
| KakaoTalk | A Kakao app's REST API key and Kakao sign-in; on a Mac, also the KakaoTalk app's window |
| YouTube Music | Its own Google sign-in with your OAuth client file |

A token connection is fast, free, and works for both agents. A claude.ai connector needs no token, but works for Claude agents only and each sidebar refresh uses a little Claude usage.

Settings also includes **General** (theme and notifications), **Profile** (your names and time zone), **Workspace** (sidebars, Inbox rules, and meeting collections), and **Advanced** (developer mode and configuration files).

## Features

Sections live in two sidebars, and whatever you open shows as a tab in the middle. By default the left sidebar has Inbox, Todo, Sessions, GitHub, and Docker; the right has Calendar, Slack, Linear, Meetings, Nuclino, KakaoTalk, and YouTube Music. Drag a section's header to reorder it or move it to the other side, or choose in Settings → Workspace → Sidebars.

### Sessions

Start a session (`C`), say what should get done and in which folder, and pick its lead: Claude or Codex, each with a model and effort. The lead creates the sub-agents it needs, can work in its own git worktree, and asks you before anything outward-facing. Review its changes line by line, then approve and merge (`⇧A`) or discard (`⇧X`). You can also import a recent Claude Code or Codex session from this Mac.

### Inbox

What needs you from agents, GitHub, Slack, your calendar, and Linear, sorted into today, this week, and this month. That includes review requests, your failing PRs, Slack DMs and @-mentions, unanswered invitations, and Linear issues and notifications. Each item says which rule put it there; change the rules in Settings → Workspace → Inbox rules. Once a day Claude moves the items the rules seem to have sorted wrongly (marked with a sparkle). Show it with `G` → `I`.

### Todo

A to-do list with due dates; overdue ones are red. `⇧T` opens a new to-do like a notepad, with a title and notes that save as you type. Each to-do can have one session: "Start a session" hands its title and notes to a lead, and the list shows that session's state.

### Meetings

The newest notes from the Nuclino collections you choose in Settings → Workspace → Meeting collections. Opening one shows Claude's summary: what was done, decided, left to do (hover a follow-up to add it to your to-dos), and not decided yet.

### GitHub

Through the logged-in `gh` CLI: your pull requests, review requests, assigned issues, and runs, for one repository or all of them. A pull request tab opens with Claude's headline review summary, plus the diff, conversation, and checks, with "Fix failing checks" and "Address review comments" hand-offs.

### Docker

Through the local `docker` CLI: containers grouped by compose project, with start, stop, and restart, and a tab with ports, mounts, environment variable names (never values), and logs that can follow.

### Work tools

Everything opens as a tab inside mothership, links to its own app, and can be handed off to a session.

- **Slack**: messages with their whole thread; reply and react.
- **Google Calendar**: today in the sidebar, a day and week view (`G` → `C`), and Yes / Maybe / No on invitations.
- **Linear**: every open issue assigned to or followed by you; comment, reply, and react.
- **Nuclino**: recent documents. Calls stay under a shared budget (60 a minute) and pause when Nuclino says to slow down, showing cached notes meanwhile.
- **Notion**: off until connected; then "Show Notion" in the command center opens Recent Notion pages.
- **KakaoTalk**: send notes to your own chat (나와의 채팅), open the app, and on a Mac see your chats.
- **YouTube Music**: your playlists and liked songs in a mini player.

The command center (`⌘P`) searches all of them at once; `⌘⇧F` searches tools only.

### Explorer

Browse your home folder like Finder and preview files read-only: images, PDFs, video, audio, rendered Markdown, and highlighted code. Secrets such as `.env` files, keys, and `.ssh` are never shown. Open it with `G` → `E`.

### Usage and This Mac

**Agent limits** shows Claude and Codex subscription usage and reset times. Open it from the usage meters at the bottom left or the command center. **This Mac** shows CPU, memory, disk, battery, and mothership's server process. Open it from the CPU or memory meter or the command center.

### Insights

The chart icon in the title bar shows how you use mothership: active time per day and per area, each feature's uses and how you reached it, and features you haven't used lately. It is recorded only on your Mac.

### Developer mode

For working on mothership itself, turn on Settings → Advanced. Then `⌘⌥F` (or the bug icon) lets you point at any part of the screen and say what should change: a session starts on mothership's own source in its own worktree, and you review and merge it like any other. The debug panel shows the app's state, page errors, and the server log.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `⌘P` | Command center: tabs, sessions, files, tools |
| `⌘K` | Commands |
| `⌘⇧F` | Search all tools |
| `C` | New session |
| `N` | Next question waiting for you |
| `⇧T` | New to-do with notes |
| `G` → `I` / `C` / `E` | Inbox / Calendar / Explorer |
| `⌘,` | Settings |
| `⌘B` / `⌘⌥B` | Toggle left / right sidebar |
| `⌥W`, `⌥[` / `⌥]` | Close tab, previous / next tab |
| `?` | All shortcuts, and change them |

Single-key shortcuts are off while you type in a text field, and keys match by physical position, so they work with Korean input too. See the full keymap in [docs/ROADMAP.md](docs/ROADMAP.md#keyboard-shortcuts).

## Configuration files

Settings covers the common setup. For the rest, edit the files in `config/` (Settings → Advanced → Open config folder). Choices made in Settings win over these files.

| File | Purpose |
| --- | --- |
| `config/mcp.yaml` | MCP servers shared by the sidebar and every agent, and which claude.ai connectors Claude agents may use |
| `config/dashboard.yaml` | Sidebar sections and their options; each reads through an MCP server (`via: mcp`) or a claude.ai connector (`via: claude-connector`) |
| `config/repositories.yaml` | Local repositories you work in, for GitHub and folder suggestions |
| `config/roles.yaml` | Agent role presets: provider, model, effort, MCP servers, worktree |
| `config/keybindings.yaml` | Your shortcut overrides; written when you change a shortcut from `?` |

Start your own copies from the examples in that folder. Until `dashboard.yaml` exists, the example is used as is.

```bash
cp dashboard.example.yaml dashboard.yaml
cp repositories.example.yaml repositories.yaml
```

## Data and privacy

| What | Where (app) | Where (checkout) |
| --- | --- | --- |
| Config | `~/Library/Application Support/Mothership/config/` | `config/` |
| Keys and tokens | `…/Mothership/.env.local` | `.env.local` |
| Sessions, worktrees, to-dos, saved choices, usage log | `…/Mothership/.mothership/` | `.mothership/` |
| Server log | `…/Mothership/logs/server.log` | the terminal, or `.mothership/server.log` under `pnpm autostart` |

- **Local only.** The app listens on `127.0.0.1:47821` (another port if that one is taken), not on your network, and refuses requests that come from other websites open in your browser.
- **Secrets.** Keys, tokens, and OAuth client files stay in `.env.local` and `.mothership/`, readable only by you, and are never sent back to the browser or shown again.
- **Your use.** Insights data stays in `usage.db` on your Mac.

## Development

Run the server from a checkout, then open http://127.0.0.1:3000.

```bash
pnpm install
pnpm dev
```

A checkout keeps its own data, separate from the app's, and runs next to it on another port.

**Demo mode** shows every screen on made-up data, with no keys. Agents connect to the demo tools too, so don't use it for real work.

```bash
pnpm dev:demo
```

**Tests and lint.** Unit tests (Vitest) cover the rules and failure handling that matter. `pnpm lint` runs ESLint and checks the dependency rules in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
pnpm test
pnpm lint
```

**Building the app.** `pnpm app:build` writes the app and a dmg to `dist/app`; `pnpm app:build --dir` builds only `dist/app/mac-arm64/Mothership.app`, which is quicker for trying it out. The dmg is signed ad hoc, not notarized: on another Mac, right-click the app → Open once.

**Installing from the browser.** With `pnpm dev` running, Chrome (install icon in the address bar) or Safari (File → Add to Dock) can open mothership in its own window. `pnpm autostart install` starts the server at login; `pnpm autostart uninstall` removes it and `pnpm autostart status` tells whether it is on.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organized, and the conventions
- [docs/ROADMAP.md](docs/ROADMAP.md): what was built, phase by phase, and the full keymap
- [docs/REVIEW.md](docs/REVIEW.md): the November 2026 code review and what changed for it

## License

[MIT](LICENSE)
