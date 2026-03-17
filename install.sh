#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

# Check pi is available
if ! command -v pi &>/dev/null; then
  echo "Error: pi is not installed or not on PATH" >&2
  exit 1
fi

# Helper: create symlink, backing up existing real file
symlink_file() {
  local src="$1"
  local dst="$2"

  if [ ! -f "$src" ]; then
    echo "Warning: source file not found: $src" >&2
    return
  fi

  # If destination is already the correct symlink, skip
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    echo "  ✓ $dst (already linked)"
    return
  fi

  # If destination exists as a real file, back it up
  if [ -f "$dst" ] && [ ! -L "$dst" ]; then
    local backup="${dst}.bak.$(date +%Y%m%d%H%M%S)"
    echo "  ⚠ Backing up existing file: $dst → $backup"
    mv "$dst" "$backup"
  fi

  # If destination exists as a stale symlink, remove it
  if [ -L "$dst" ]; then
    rm "$dst"
  fi

  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  echo "  ✓ Linked $dst → $src"
}

echo "=== Setting up symlinks ==="

# Symlink config files into ~/.pi
symlink_file "$REPO_DIR/AGENTS.md" "$PI_DIR/AGENTS.md"
symlink_file "$REPO_DIR/agents/arch-review.md" "$PI_DIR/agents/arch-review.md"
symlink_file "$REPO_DIR/philosophy.md" "$HOME/.pi/philosophy.md"

echo ""
echo "=== Installing web-browser skill dependencies ==="
if [ -f "$REPO_DIR/skills/web-browser/scripts/package.json" ]; then
  (cd "$REPO_DIR/skills/web-browser/scripts" && npm install --silent)
  echo "  ✓ Dependencies installed"
else
  echo "  (skipped - no package.json found)"
fi

echo ""
echo "=== Installing pi package ==="
pi install "$REPO_DIR"
echo "  ✓ Package installed"

echo ""
echo "Done! Symlinks point to files in $REPO_DIR"
echo ""
echo "Start pi and run /context to verify."
