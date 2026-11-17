<p align="center">
  <img src="src/app/icon.svg" width="96" height="96" alt="mothership icon: a mothership beaming down a small ship">
</p>

<h1 align="center">mothership</h1>

<p align="center">
  A personal workspace for macOS (and, in preview, Windows).<br>
  Your scattered work tools on one screen, and Claude or Codex agents right where you see the work.
</p>

- **One screen.** Slack, Google Calendar, Linear, Nuclino, Notion, GitHub, and Docker side by side.
- **Hand off anything.** Start an agent session from a Slack thread, an issue, a to-do, or a failing pull request.
- **One Inbox.** What needs you, sorted by how soon: now, soon, or later.
- **Local.** The app serves itself on your Mac; nothing leaves it except calls to the tools you connect.

## Contents

- [Install and update](#install-and-update)
  - [macOS](#macos)
  - [Windows (preview)](#windows-preview)
- [First run](#first-run)
- [Features](#features)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Configuration files](#configuration-files)
- [Data and privacy](#data-and-privacy)
- [Development](#development)
- [Docs](#docs)
- [License](#license)

## Install and update

### macOS

For Apple Silicon. You build it on your own Mac, so macOS opens it without the warning it shows for downloaded apps. You need git, Node 24 or newer, and pnpm (`corepack enable`); the script checks for them and says how to get what is missing.

**To install or update**, run:

```bash
curl -fsSL https://raw.githubusercontent.com/61uehigh/mothership/main/scripts/install.sh | bash
```

It clones into `~/mothership` (or updates the checkout there), runs `pnpm install`, and runs `pnpm app:install`, which builds the app, puts it in `/Applications` (quitting and replacing an older copy), and opens it. Your data stays. From the checkout, `pnpm app:update` does the same. If you cloned somewhere else, set `MOTHERSHIP_DIR` (`curl … | MOTHERSHIP_DIR=~/code/mothership bash`).

> [!NOTE]
> `main` is rewritten from time to time (force-pushed), so updates reset to `origin/main` instead of `git pull`. That keeps untracked and ignored files (`.env.local`, `.mothership/`, and your `config/dashboard.yaml`, `repositories.yaml`, and `keybindings.yaml`) but would discard edits to tracked files such as `config/mcp.yaml`, so the script stops and lists them instead: copy them first.

<details>
<summary>The same by hand</summary>

```bash
git clone https://github.com/61uehigh/mothership.git ~/mothership
cd ~/mothership
pnpm install
pnpm app:install
```

To update:

```bash
cd ~/mothership
git fetch origin
git reset --hard origin/main
pnpm install
pnpm app:install
```

</details>

Good to know:

- The app runs its own server, so you need no terminal once it is installed.
- It ships the Claude Code and Codex command-line tools. `git`, the GitHub CLI (`gh`), Docker, and Node (for `npx`-started MCP servers) come from your shell's `PATH`.
- Closing the window keeps the app and any running agents going. Quit with `⌘Q`.

### Windows (preview)

A Windows x64 installer. It has not been tried on a real Windows PC yet, so expect rough edges. The install script and `pnpm app:update` above are macOS only.

#### Download a built installer

The **Windows installer** workflow ([`.github/workflows/windows.yml`](.github/workflows/windows.yml)) builds it on a GitHub Windows runner, so you don't need a Mac. It runs when a `v*` tag is pushed, or when you start it: Actions tab → **Windows installer** → **Run workflow**.

1. Open [Actions → Windows installer](https://github.com/61uehigh/mothership/actions/workflows/windows.yml) while signed in to GitHub.
2. Open the latest run with a green check.
3. Under **Artifacts** at the bottom, click **Mothership-Setup-windows-x64**. The zip holds `Mothership-Setup-<version>-x64.exe`.

Or with the GitHub CLI:

```bash
gh run download -R 61uehigh/mothership -n Mothership-Setup-windows-x64 $(gh run list -R 61uehigh/mothership -w windows.yml -s success -L 1 --json databaseId -q '.[0].databaseId')
```

Artifacts are kept for 14 days; after that, run the workflow again. A push to `main` does not rebuild it.

#### Build it yourself

On a Mac or on Windows, from the same checkout:

```bash
pnpm install
pnpm app:build --win
```

This writes `dist/app/Mothership-Setup-<version>-x64.exe`. `--win --dir` writes only the unpacked app (`dist/app/win-unpacked`). The first build fetches the Windows builds of Claude Code and Codex from npm.

#### Install and update

- Run the installer on your PC; it installs for your user only.
- It is not signed, so Windows SmartScreen warns first: choose **More info** → **Run anyway**.
- To update, run a newer installer. Your data stays.

#### How it differs from macOS

- Your data lives in `%APPDATA%\Mothership` instead of Application Support.
- The window has the normal Windows title bar, and closing it quits the app (it asks first while sessions are working).
- Logins open in a Command Prompt window; folders open in Windows Terminal (or Command Prompt), VS Code, or File Explorer.
- macOS only: reading KakaoTalk chats (the section can still open KakaoTalk), memory pressure, swap, and battery in This computer, `scripts/install.sh`, `pnpm app:install`, `pnpm app:update`, and `pnpm autostart`.

## First run

Settings opens with a welcome note on first start. Open it later from the gear at the top right or `⌘,`.

### 1. Agents

You need at least one:

| Agent | Sign in with | Or |
| --- | --- | --- |
| Claude | a `claude` login (Log in to Claude) | `ANTHROPIC_API_KEY` |
| Codex | a ChatGPT login (Log in with ChatGPT) | `OPENAI_API_KEY` |

Pick your **default lead** (Claude or Codex) on the same page. The lead you start a session with becomes the new default.

### 2. Local tools

Settings → Connections → Local tools checks that the GitHub CLI is logged in and Docker is running, and gives the next step when one isn't.

### 3. Connections

Each work tool has a card with a short checklist: one line per step, a link to the exact page, and a ✓ once the app can tell the step is done. Saving a token or signing in tests the connection at once and shows who it connects as.

| Tool | How it connects |
| --- | --- |
| Slack, Linear, Nuclino, Notion | Its own MCP server with your token, or a claude.ai connector you already connected |
| Google Calendar | Its MCP server with your own Google OAuth client (three Google Cloud steps, then Sign in with Google), or the claude.ai connector |
| Gmail | Its own Google sign-in (read-only) with Google Calendar's OAuth client file, after turning on the Gmail API in that project |
| KakaoTalk | On a Mac, the KakaoTalk app's window (Accessibility and Automation permissions) |
| YouTube Music | Its own Google sign-in with your OAuth client file |

> [!TIP]
> A **token** connection is fast, free, and works for both agents. A **claude.ai connector** needs no token, but works for Claude agents only, and each sidebar refresh uses a little Claude usage.

Settings also has:

- **General**: theme, language, time zone (this computer's unless you choose one), and notifications
- **Profile**: your names and Slack member ID
- **Workspace**: sidebars, Inbox rules, and meeting collections
- **Advanced**: developer mode and configuration files

## Features

Sections live in two sidebars, and whatever you open shows as a tab in the middle. Drag a section's header to reorder it or move it to the other side, or choose in Settings → Workspace → Sidebars.

| Sidebar | Sections by default |
| --- | --- |
| Left | Inbox, Todo, Sessions, GitHub, Docker |
| Right | Calendar, Gmail, Slack, Linear, Meetings, Nuclino, KakaoTalk, YouTube Music |

### Sessions

1. Start a session (`C`): say what should get done and in which folder, and pick its lead (Claude or Codex, each with a model and effort).
2. The lead creates the sub-agents it needs, can work in its own git worktree, and asks you before anything outward-facing.
3. Review its changes line by line, then approve and merge (`⇧A`) or discard (`⇧X`).

You can also import a recent Claude Code or Codex session from this Mac.

### Inbox

What needs you from agents, GitHub, Slack, your calendar, Linear, and Gmail, sorted into today, this week, and this month. Show it with `G` → `I`.

- **What lands there**: review requests, your failing PRs, Slack DMs and @-mentions, unanswered invitations, Linear issues and notifications, and unread mail (important mail today, the rest this week).
- **Rules**: each item says which rule put it there; change them in Settings → Workspace → Inbox rules. Once a day Claude moves the items the rules seem to have sorted wrongly (marked with a sparkle).
- **Two views**: the header switches between that view and one list, newest first, where anything overdue or waiting on you keeps a red mark.
- **Unread**: new items show as unread with a count on the section. Opening one reads it, clicking the count shows unread only, and you can mark all as read or mark one unread again.
- **Linear**: read marks are kept in mothership, except Linear notifications, which follow Linear's own read state. Reading one in the Inbox (opening it, Mark as read, or Mark all as read) marks it read in Linear too, and Mark as unread marks it unread there.

### Todo

Your to-dos by day: Today, the next workday, Later, and Someday, then what you finished.

- A to-do has the day you mean to do it and, if it has one, a due date (overdue ones are red).
- Anything left from a past day carries over to today with a ↻ count, so the ones you keep putting off stand out.
- `⇧T` opens a new to-do like a notepad, with a title and notes that save as you type.
- Each to-do can have one session: **Start a session** hands its title and notes to a lead, and the list shows that session's state.

#### Daily

`G` → `D` opens **Daily**, one day at a time.

- **Today** shows your plan, suggestions to plan from (someday to-dos and today's Inbox), the rest of today's calendar, and what you got done.
- **Done** lists the to-dos you checked off. Under it you can add something you did on any day up to today, or pick from what your tools saw that day under **From your tools**: pull requests you opened or merged, Linear issues you completed (with `LINEAR_API_KEY`), and sessions you worked in.
- **Copy standup** puts the Daily Scrum update (the last workday, today, blockers) on the clipboard.
- **Wrap up** moves what's left to the next workday or someday.

| Keys | Action |
| --- | --- |
| `[` / `]` | Previous / next day |
| `J` / `K` | Move between rows |
| `X` | Check off |
| `B` | Mark blocked |
| `T` / `M` / `S` | Plan for today / the next workday / someday |

<details>
<summary>Import done to-dos from Slack Daily Scrum posts</summary>

`POST /api/todos/import/slack-scrum` with `{"channel": "C…", "dryRun": true}` reads your Daily Scrum posts in a Slack channel and shows what their "어제 한 일" would add as done to-dos, dated to the last workday before each post (weekends and Korean public holidays skipped). `"dryRun": false` adds them, and running it again adds nothing twice.

</details>

### Meetings

The newest notes from the Nuclino collections you choose in Settings → Workspace → Meeting collections. Opening one shows Claude's summary: what was done, decided, left to do (hover a follow-up to add it to your to-dos), and not decided yet.

### GitHub

Through the logged-in `gh` CLI: your pull requests, review requests, assigned issues, and runs, for one repository or all of them. A pull request tab opens with Claude's headline review summary, plus the diff, conversation, and checks, with **Fix failing checks** and **Address review comments** hand-offs.

### Docker

Through the local `docker` CLI: containers grouped by compose project, with start, stop, and restart, and a tab with ports, mounts, environment variable names (never values), and logs that can follow.

### Work tools

Everything opens as a tab inside mothership, links to its own app, and can be handed off to a session. The command center (`⌘P`) searches all of them at once; `⌘⇧F` searches tools only.

| Tool | What you get |
| --- | --- |
| Slack | Messages with their whole thread; reply and react |
| Google Calendar | Today in the sidebar, a day and week view (`G` → `C`), and Yes / Maybe / No on invitations |
| Linear | Every open issue assigned to or followed by you; comment, reply, and react |
| Nuclino | Recent documents. Calls stay under a shared budget (60 a minute) and pause when Nuclino says to slow down, showing cached notes meanwhile |
| Notion | Off until connected; then "Show Notion" in the command center opens Recent Notion pages |
| Gmail | Your inbox's newest unread (or all) mail, one line each. A message opens in a tab with remote images blocked until you show them, and unread mail joins the Inbox. Read-only, so reading here leaves mail unread in Gmail |
| KakaoTalk | On a Mac, your recent chats, each opening in the app; anywhere, open the app. Never sends messages |
| YouTube Music | Your playlists and liked songs in a mini player |

### Explorer

Browse your home folder like Finder and preview files read-only: images, PDFs, video, audio, rendered Markdown, and highlighted code. Secrets such as `.env` files, keys, and `.ssh` are never shown. Open it with `G` → `E`. A file link in an agent's reply opens here, at the line it points to.

### Usage, This computer, and Insights

- **Agent limits**: Claude and Codex subscription usage and reset times. Open it from the usage meters at the bottom left or the command center.
- **This computer**: CPU, memory, disk, battery, and mothership's server process. Open it from the CPU or memory meter or the command center.
- **Insights** (chart icon in the title bar): how you use mothership, with active time per day and per area, each feature's uses and how you reached it, and features you haven't used lately. Recorded only on your Mac.

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
| `G` → `D` | Daily: plan, done, standup |
| `G` → `I` / `C` / `E` | Inbox / Calendar / Explorer |
| `⌘,` | Settings |
| `⌘B` / `⌘⌥B` | Toggle left / right sidebar |
| `⌥W`, `⌥[` / `⌥]` | Close tab, previous / next tab |
| `?` | All shortcuts, and change them |

Single-key shortcuts are off while you type in a text field. Keys match by physical position, so they work with Korean input too. The full keymap is in [docs/ROADMAP.md](docs/ROADMAP.md#keyboard-shortcuts).

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
| Config | `~/Library/Application Support/Mothership/config/` (Windows: `%APPDATA%\Mothership\config\`) | `config/` |
| Keys and tokens | `…/Mothership/.env.local` | `.env.local` |
| Sessions, worktrees, to-dos, saved choices, usage log | `…/Mothership/.mothership/` | `.mothership/` |
| Server log | `…/Mothership/logs/server.log` | the terminal, or `.mothership/server.log` under `pnpm autostart` |

- **Local only.** The app listens on `127.0.0.1:47821` (another port if that one is taken), not on your network, and refuses requests that come from other websites open in your browser.
- **Secrets.** Keys, tokens, and OAuth client files stay in `.env.local` and `.mothership/`, readable only by you, and are never sent back to the browser or shown again.
- **Your use.** Insights data stays in `usage.db` on your Mac.

## Development

Run the server from a checkout, then open http://127.0.0.1:3000. A checkout keeps its own data, separate from the app's, and runs next to it on another port.

```bash
pnpm install
pnpm dev
```

| Command | What it does |
| --- | --- |
| `pnpm dev:demo` | Every screen on made-up data, with no keys. Agents connect to the demo tools too, so don't use it for real work |
| `pnpm test` | Unit tests (Vitest) for the rules and failure handling that matter |
| `pnpm lint` | ESLint, plus the dependency rules in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `pnpm app:build` | The app and a dmg in `dist/app`. The dmg is signed ad hoc, not notarized: on another Mac, right-click the app → Open once |
| `pnpm app:build --dir` | Only `dist/app/mac-arm64/Mothership.app`, quicker for trying it out |
| `pnpm app:build --win` | The Windows installer (see [Windows](#windows-preview)) |
| `pnpm app:update` | Updates this checkout to the latest `main` and installs the app again (macOS only, see [Install and update](#install-and-update)) |
| `pnpm autostart install` | Starts the server at login (macOS only, through a LaunchAgent); `uninstall` removes it, `status` tells whether it is on |

With `pnpm dev` running, Chrome (install icon in the address bar) or Safari (File → Add to Dock) can also open mothership in its own window.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organized, and the conventions
- [docs/ROADMAP.md](docs/ROADMAP.md): what was built, phase by phase, and the full keymap
- [docs/REVIEW.md](docs/REVIEW.md): the November 2026 code review and what changed for it

## License

[MIT](LICENSE)
