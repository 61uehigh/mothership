#!/usr/bin/env bash
# Installs or updates mothership on an Apple Silicon Mac, with one command:
#
#   curl -fsSL https://raw.githubusercontent.com/61uehigh/mothership/main/scripts/install.sh | bash
#
# or, from a checkout, `pnpm app:update`.
#
# - No checkout yet: clones the repository.
# - A checkout: refuses if tracked files have local edits; otherwise fetches and
#   resets to origin/main (main is force-pushed from time to time, so `git pull`
#   isn't safe). Ignored and untracked files such as .env.local, .mothership/ and
#   your own config/*.yaml stay.
# Then `pnpm install --frozen-lockfile` and `pnpm app:install`.
#
# Environment:
#   MOTHERSHIP_DIR=path           the checkout (default ~/mothership)
#   MOTHERSHIP_REPO=url           where to clone from (default the GitHub repository)
#   MOTHERSHIP_SKIP_APP_INSTALL=1 stop before `pnpm app:install` (for trying the script out)
#
# Everything runs inside main(), so a partly downloaded script does nothing.

set -euo pipefail

# Node major version the repository is checked and built with (.github/workflows).
REQUIRED_NODE_MAJOR=24
DEFAULT_REPO="https://github.com/61uehigh/mothership.git"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
fail() {
  printf '\n\033[1;31mError:\033[0m %s\n' "$1" >&2
  shift
  local line
  for line in "$@"; do printf '    %s\n' "$line" >&2; done
  exit 1
}

check_prerequisites() {
  step "Checking prerequisites"

  [[ "$(uname -s)" == "Darwin" ]] ||
    fail "This script is for macOS." "On Windows, use the installer: see \"Windows (preview)\" in the README."
  [[ "$(uname -m)" == "arm64" ]] ||
    fail "mothership is built for Apple Silicon Macs (this Mac is $(uname -m))."

  local missing=()

  if command -v git >/dev/null 2>&1; then
    info "git   $(git --version | awk '{print $3}')"
  else
    missing+=("git: run \`xcode-select --install\` (Command Line Tools), or \`brew install git\`.")
  fi

  if command -v node >/dev/null 2>&1; then
    local version major arch
    version="$(node -p 'process.versions.node')"
    major="${version%%.*}"
    arch="$(node -p 'process.arch')"
    if ((major < REQUIRED_NODE_MAJOR)); then
      missing+=("Node $REQUIRED_NODE_MAJOR or newer (found $version): \`nvm install $REQUIRED_NODE_MAJOR\`, or download it from https://nodejs.org.")
    elif [[ "$arch" != "arm64" ]]; then
      missing+=("arm64 Node (this Node is $arch, probably running under Rosetta): install the Apple Silicon build of Node $REQUIRED_NODE_MAJOR.")
    else
      info "node  $version"
    fi
  else
    missing+=("Node $REQUIRED_NODE_MAJOR or newer: \`nvm install $REQUIRED_NODE_MAJOR\`, or download it from https://nodejs.org.")
  fi

  if command -v pnpm >/dev/null 2>&1; then
    info "pnpm  $(pnpm --version)"
  else
    missing+=("pnpm: \`corepack enable\` (comes with Node $REQUIRED_NODE_MAJOR), or \`npm install -g pnpm\`.")
  fi

  if ((${#missing[@]} > 0)); then
    fail "Some prerequisites are missing. Install them, then run this again:" "${missing[@]/#/- }"
  fi
}

clone() {
  local dir="$1" repo="$2"
  step "Cloning mothership into $dir"
  mkdir -p "$(dirname "$dir")"
  git clone "$repo" "$dir"
}

update() {
  local dir="$1"
  step "Updating $dir"

  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fail "$dir exists but is not a git checkout." "Move it away, or set MOTHERSHIP_DIR to your mothership checkout."
  local top
  top="$(cd "$dir" && git rev-parse --show-toplevel)"
  if [[ "$top" != "$(cd "$dir" && pwd -P)" ]] || ! grep -qs '"name": "mothership"' "$dir/package.json"; then
    fail "$dir is not a mothership checkout." "Move it away, or set MOTHERSHIP_DIR to your mothership checkout."
  fi
  git -C "$dir" remote get-url origin >/dev/null 2>&1 ||
    fail "$dir has no \`origin\` remote to update from."

  local branch
  branch="$(git -C "$dir" symbolic-ref --quiet --short HEAD || true)"
  [[ "$branch" == "main" ]] ||
    fail "$dir is on ${branch:-a detached HEAD}, not main, so nothing was changed." \
      "Switch back with \`git -C \"$dir\" switch main\`, then run this again."

  local edits
  edits="$(git -C "$dir" status --porcelain --untracked-files=no)"
  if [[ -n "$edits" ]]; then
    local files=()
    while IFS= read -r line; do files+=("  ${line:3}"); done <<<"$edits"
    fail "These tracked files have local edits, and updating would discard them. Nothing was changed." \
      "${files[@]}" \
      "" \
      "To keep them, copy them somewhere first (for example \`cp config/mcp.yaml ~/mcp.yaml.mine\`)," \
      "then \`git -C \"$dir\" checkout -- .\` and run this again. To drop them, just run that checkout."
  fi

  info "origin: $(git -C "$dir" remote get-url origin)"
  git -C "$dir" fetch origin
  local before after
  before="$(git -C "$dir" rev-parse --short HEAD)"
  git -C "$dir" reset --hard origin/main
  after="$(git -C "$dir" rev-parse --short HEAD)"
  if [[ "$before" == "$after" ]]; then
    info "Already at the latest main ($after)."
  else
    info "Moved from $before to $after."
  fi
}

main() {
  local dir="${MOTHERSHIP_DIR:-$HOME/mothership}"
  local repo="${MOTHERSHIP_REPO:-$DEFAULT_REPO}"
  dir="${dir%/}"

  bold "mothership installer"
  check_prerequisites

  if [[ -e "$dir" ]]; then
    update "$dir"
  else
    clone "$dir" "$repo"
  fi

  cd "$dir"
  step "Installing dependencies"
  pnpm install --frozen-lockfile

  if [[ "${MOTHERSHIP_SKIP_APP_INSTALL:-}" == "1" ]]; then
    step "Skipping pnpm app:install (MOTHERSHIP_SKIP_APP_INSTALL=1)"
  else
    step "Building and installing the app"
    pnpm app:install
  fi

  step "Done"
  info "To update later: \`pnpm app:update\` in $dir, or run this command again."
}

# One line, so bash has read all of it before main runs: an update rewrites this file.
main "$@"; exit $?
