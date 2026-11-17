#!/usr/bin/env bash
# Starts mothership when you log in to this Mac, so the installed app always
# has a server to open. A macOS LaunchAgent runs `pnpm dev` from this folder
# and restarts it if it crashes. Output goes to .mothership/server.log.
# Background jobs don't load your shell setup (nvm, Homebrew), so the PATH
# and pnpm found when you run `install` are saved with it; run `install`
# again after switching Node versions.
#
#   pnpm autostart install     start now and at every login
#   pnpm autostart uninstall   stop it and remove it
#   pnpm autostart status      whether it is loaded
set -euo pipefail

LABEL="com.mothership.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="gui/$(id -u)"

xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

case "${1:-status}" in
  install)
    if [ "$(uname)" != "Darwin" ]; then echo "Auto-start uses macOS LaunchAgents; on other systems start it with your own service manager." >&2; exit 1; fi
    if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "Something already listens on port 3000 (your own pnpm dev?). Stop it first, then run this again." >&2
      exit 1
    fi
    pnpm_path="$(command -v pnpm || true)"
    if [ -z "$pnpm_path" ]; then echo "pnpm is not on your PATH; install it, then run this again." >&2; exit 1; fi
    mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/.mothership"
    root_xml="$(xml_escape "$ROOT")"
    cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$pnpm_path")</string>
    <string>dev</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml_escape "$PATH")</string>
  </dict>
  <key>WorkingDirectory</key><string>$root_xml</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>$root_xml/.mothership/server.log</string>
  <key>StandardErrorPath</key><string>$root_xml/.mothership/server.log</string>
</dict>
</plist>
EOF
    plutil -lint "$PLIST" >/dev/null
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "mothership now starts at login: http://127.0.0.1:3000 (log: .mothership/server.log)"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Auto-start removed."
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then echo "Auto-start is on ($PLIST)."; else echo "Auto-start is off."; fi
    ;;
  *)
    echo "Usage: pnpm autostart [install|uninstall|status]" >&2
    exit 2
    ;;
esac
