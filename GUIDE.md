# Agent Tooling Setup Guide

This repo contains configuration, agents, and install scripts for each CLI coding agent I use. Each tool gets its own directory (e.g. `pi/`, `opencode/`) with a consistent set of components adapted to that tool's conventions.

This guide defines what each directory should include and why.

---

## Directory Structure

```
<tool>/
├── install.sh          # Setup script
├── AGENTS.md           # Global instructions (system prompt / rules)
├── agents/             # Subagent definitions
│   ├── scout.md
│   ├── planner.md
│   ├── developer.md
│   ├── code-review.md
│   ├── code-quality.md
│   ├── arch-review.md
│   ├── plan-checker.md
│   └── ui-qa.md
├── auth.md             # Authentication setup guide
├── philosophy.md       # Architecture principles for review agents
└── ...                 # Tool-specific extras (extensions, themes, etc.)
```

---

## 1. Install Script (`install.sh`)

A single entry point that makes the tool fully operational from a fresh clone.

### Must do

- **Check the CLI is on PATH.** If not, look for it in common locations (e.g. `/opt/homebrew/bin/`) and symlink it to `/usr/local/bin/` (or prompt the user).
- **Symlink configuration files** into wherever the tool reads its config from (e.g. `~/.pi/agent/` for pi, `~/.config/opencode/` for opencode). Back up any existing real files before overwriting.
- **Symlink agents** from the repo's `agents/` directory into the tool's agent directory.
- **Install dependencies** if any components need them (e.g. npm packages for extensions).
- **Be idempotent.** Running it twice should produce the same result — skip symlinks that already point to the right place, don't duplicate shell config entries.

### Nice to have

- Configure shell integration (e.g. wrapper functions in `.zshrc.local`).
- Register the repo as a package/plugin if the tool supports it.
- Print a summary of what was linked and a "verify it works" command.

### Template

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="<tool-specific config path>"

# 1. Check CLI is available
if ! command -v <tool> &>/dev/null; then
  # Attempt to find and symlink, or error out
fi

# 2. Symlink global config
symlink_file "$REPO_DIR/AGENTS.md" "$CONFIG_DIR/AGENTS.md"

# 3. Symlink agents
for agent in "$REPO_DIR"/agents/*.md; do
  symlink_file "$agent" "$CONFIG_DIR/agents/$(basename "$agent")"
done

# 4. Tool-specific setup (extensions, packages, etc.)
```

---

## 2. Global Instructions (`AGENTS.md`)

The system-level prompt that applies to every session and subagent. This is the most important file — it shapes all agent behaviour.

### Must include

#### Bash safety rules
Agents must never run long-lived processes (dev servers, watchers, `docker compose up`). Include:
- An explicit blocklist of common offenders (`npm run dev`, `yarn start`, `vite`, etc.)
- Safe alternatives (build commands, background + timeout patterns, curl checks)
- A clear explanation of _why_ — the agent hangs forever if a command doesn't exit

#### Git workflow
Define how the agent handles version control across all repos:

- **Before work:** Check `git status`. If there are uncommitted changes, summarise them and ask before proceeding.
- **After work:** Stage and commit with a plain english message. No conventional commit prefixes.
- **On follow-up:** Classify intent before acting:
  - **Fix it** — soft reset the last commit, apply fixes, recommit (keeps one clean commit)
  - **Build on it** — leave previous commit, start new work
  - **Scrap it** — stash the changes with a description, revert

This workflow keeps history clean without requiring the user to manage git manually.

#### Code style
Short rules: match existing patterns, small functions, descriptive names, comments only where non-obvious.

### Adapt per tool
Different tools have different config formats. Some use markdown files, some use TOML/YAML, some embed instructions in a config block. The _content_ should be equivalent; the _format_ must match what the tool expects.

---

## 3. Agents

Reusable subagent definitions. Each agent has a single role and a tightly scoped prompt. The set below covers the core development loop:

| Agent | Role | Key constraints |
|---|---|---|
| **scout** | Fast codebase recon — grep/find/read to gather minimal context | Max 10 files, output under 100 lines, never modify anything |
| **planner** | Turn requirements + context into a concrete implementation plan | Read-only, plan under 50 lines, one action per step |
| **developer** | Write code — features, fixes, refactors | Match existing patterns, work incrementally, verify with build/test |
| **code-review** | Combined quality + architecture review | Read-only, flag issues by severity |
| **code-quality** | Focused review for duplication, complexity, dead code, accretion | Read-only |
| **arch-review** | Check implementation against architecture philosophy | Read-only, references `philosophy.md` |
| **plan-checker** | Verify the implementation matches the original plan | Read-only, diff plan vs reality |
| **ui-qa** | Visual/functional testing via browser automation | Takes screenshots, checks interactions |

### Format per tool

Each tool has its own agent definition format:

- **pi**: Markdown files with YAML frontmatter (`name`, `description`, `tools`)
- **opencode**: Check the tool's docs — may use TOML, markdown, or config entries

The prompt content can be identical or near-identical across tools. Only the wrapper format changes.

### Principles for writing agents

- **One job per agent.** If the prompt says "and also...", split it into two agents.
- **Explicit constraints.** State what the agent must NOT do (no writes, no servers, max output length).
- **Structured output.** Define the exact output format so the next agent (or the user) can consume it predictably.
- **Minimal scope on tools.** Only grant the tools the agent actually needs (e.g. scout gets `read` and `bash`, not `edit` or `write`).

---

## 4. Authentication Guide (`auth.md`)

A short reference for how to configure API keys for the tool.

### Must cover

- **Where credentials go** — file path and format (JSON, TOML, env vars, etc.)
- **Which providers are supported** — Anthropic, OpenAI, Google, OpenRouter, etc.
- **Key formats accepted** — literal keys, environment variable names, shell commands (e.g. `!op read ...` for 1Password)
- **Minimal example** — a copy-pasteable config block with placeholder values

### Keep it short

This is a reference, not a tutorial. Someone who already has API keys should be able to set it up in under a minute.

---

## 5. Architecture Philosophy (`philosophy.md`)

A set of principles that the `arch-review` agent checks code against. This file is project-agnostic by default but is designed to be customised per-project.

### Standard sections

- **Module boundaries** — what can import what
- **Separation of concerns** — where business logic, data access, and presentation live
- **Dependency direction** — always inward (UI → Features → Domain → Core)
- **Naming & organisation** — domain language, group by feature not file type
- **Data flow** — state ownership, side effect containment
- **Anti-patterns** — concrete signs of architecture degradation (5+ imports, god files, circular deps)

This file is the same across all tools — it's about the _code_, not the agent tool.

---

## Tool-Specific Extras

Some tools support additional customisation that doesn't fit the categories above. Put these in the tool's directory but don't expect them to be portable:

- **pi**: Extensions (`pi-extensions/`), themes (`pi-theme/`), intercepted commands (`intercepted-commands/`), skills (`skills/`)
- **opencode**: TBD — check what the tool supports and add equivalent directories as needed

---

## Adding a New Tool

1. Create a directory: `<tool>/`
2. Write `install.sh` following the template above
3. Copy `AGENTS.md` and adapt the format (content stays the same where possible)
4. Copy agent definitions from `pi/agents/` and reformat for the new tool
5. Write `auth.md` for the tool's credential setup
6. Symlink or copy `philosophy.md` (it's tool-agnostic)
7. Add any tool-specific extras
8. Test: run `install.sh`, start the tool, verify agents are available
