<p align="center">
  <img src="src/app/icon.svg" width="96" height="96" alt="mothership icon: a mothership beaming down a small ship">
</p>

<h1 align="center">mothership</h1>

A personal workspace that puts your scattered work tools (Nuclino, Linear, Slack, Google Calendar) on one screen, and lets you hand work to Claude, Codex, and GPT agents right where you see it.

## Install

A macOS app for Apple Silicon. It runs its own server, so you need no terminal once it is installed. You build it on your Mac, so macOS opens it without the warning it shows for downloaded apps. Needs Node and pnpm.

```bash
git clone https://github.com/61uehigh/mothership.git
cd mothership
pnpm install
pnpm app:install
```

`pnpm app:install` builds the app, puts it in `/Applications` (quitting and replacing an older one), and opens it. To update, run `git pull` and `pnpm app:install` again; your data stays.

### About the app

- The app runs mothership's server with Electron's own Node and ships the Claude Code and Codex command-line tools. The GitHub CLI, Docker, and git come from your shell's `PATH`, and so does Node for MCP servers started with `npx` (the Google Calendar server in `config/mcp.yaml`).
- Your data lives in `~/Library/Application Support/Mothership`: `config/`, `.env.local`, the session database, worktrees, and `logs/server.log`.
- The app serves itself on 127.0.0.1:47821 (another port if that one is taken). It listens on this Mac only, not on your network, and refuses requests that come from other websites open in your browser.
- Closing the window keeps the app, and any running agents, going; quit it with ⌘Q.
- To hand the app to someone without building it, `pnpm app:build` writes `dist/app/Mothership-<version>-arm64.dmg`; they open it and drag Mothership to Applications. It is signed ad hoc, not notarized, so on another Mac it is blocked until they right-click the app → Open once; sharing it widely needs an Apple Developer ID.

## Settings

On first start, Settings opens with a welcome note. It shows which agents you can run (a `claude` login or an Anthropic API key, a Codex login, an OpenAI API key), whether the GitHub CLI and Docker are ready, and lets you connect each work tool: with its own token (the tool's MCP server) or through a claude.ai connector you already connected, and test it. Keys and tokens are saved to `.env.local` in the data folder (readable only by you) and are never shown again. Settings opens any time from the gear at the top right or `⌘,`, and Settings → Open config folder opens the `config/` folder, with the example files to copy from.

Every section is on screen at once: sessions, GitHub, and Docker stacked on the left; calendar, Slack, Linear, and Nuclino on the right. Choose which sections each sidebar shows, and their order, in Settings → Sidebars. Whatever you pick opens in the middle, which is otherwise empty. The title bar has the command center (`⌘P`) and Settings. Press `?` for keyboard shortcuts. The theme is dark by default; switch it in Settings.

## Configuration

Settings covers the common setup. For everything else, edit the files in the `config/` folder (Settings → Open config folder; in a checkout, `config/` in the project); choices made in Settings win over them. Start your own copies from the examples, in that folder:

```bash
cp dashboard.example.yaml dashboard.yaml
cp repositories.example.yaml repositories.yaml
```

Until `dashboard.yaml` exists, the example is used as is.

- `config/mcp.yaml`: MCP servers shared by the dashboard and every agent (Nuclino, Linear, Slack, Google Calendar), plus which claude.ai connectors Claude agents may use for tools not configured here.
- `config/dashboard.yaml`: Sidebar sections, their order, and options. Each widget reads its data either by calling an MCP server directly (`via: mcp`) or through a claude.ai connector relay (`via: claude-connector`). The relay needs a `claude` login.
- `config/repositories.yaml`: Local repositories you work in, for the GitHub section and folder suggestions.
- `config/roles.yaml`: Agent role presets (provider, model, effort, MCP servers, whether to work in a separate git worktree).
- `config/keybindings.yaml`: Your shortcut overrides. The app writes this when you change a shortcut from `?`.
- In a checkout, data is stored in `.mothership/mothership.db` (SQLite), and agent worktrees in `.mothership/worktrees/`. Both stay out of git.

## Development

Run the server from a checkout:

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. A checkout keeps its own data, separate from the app's, so the two never share sessions: keys go to `.env.local` (git-ignored), other choices to `.mothership/settings.json`, and config to `config/`. It runs next to the app, which uses another port.

To see the screens without any keys, use demo mode, which runs on made-up data. Agents connect to the demo tools too, so don't use it for real work.

```bash
pnpm dev:demo
```

### Install from the browser

With the dev server running, you can also install the page itself: in Chrome, click the install icon at the right end of the address bar (or ⋮ → Cast, save, and share → Install page as app); in Safari, choose File → Add to Dock. It then opens in its own window with a Dock icon, but needs the server running. To start it whenever you log in (macOS), stop your own `pnpm dev` and run:

```bash
pnpm autostart install
```

It runs `pnpm dev` from this folder in the background and restarts it if it crashes; the log is `.mothership/server.log`. `pnpm autostart uninstall` removes it, and `pnpm autostart status` tells whether it is on.

### Building the app

`pnpm app:build` builds the app and a dmg into `dist/app`; `pnpm app:build --dir` builds just `dist/app/mac-arm64/Mothership.app`, which is quicker for trying it out.

### Tests

```bash
pnpm test
```

Unit tests (Vitest) cover the text parsers (Slack, calendar descriptions, mentions), the secret-file list, and the request guard in `src/proxy.ts`.

`pnpm lint` runs ESLint and checks that imports follow the dependency rules in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), which also explains how the code is organized.

## Roadmap

[docs/ROADMAP.md](docs/ROADMAP.md)

## License

[MIT](LICENSE)
