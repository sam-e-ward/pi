# opencode auto-commit plugin

Automatically commits file changes after each agent turn, similar to pi's `auto-commit` extension.

## Behavior

- After the agent finishes a turn, scans tool calls for file writes/edits
- Groups changed files by git repo and stages only those files
- Commits with an `AI: Update <files>` message
- If the same repo was committed in the previous turn, **amends** the commit (folding changes together)
- Shows toast notifications for commits and amends
- Provides a `scrap` tool that undoes the last auto-commit and stashes the changes

## Setup

1. Install dependencies:

```bash
cd ~/.agents/opencode/plugins
npm install
```

2. Add the plugin to your project's `opencode.json`:

```json
{
  "plugin": ["~/.agents/opencode/plugins/auto-commit.ts"]
}
```

Or to enable globally, add it to `~/.config/opencode/config.json`:

```json
{
  "plugin": ["~/.agents/opencode/plugins/auto-commit.ts"]
}
```

## Differences from pi auto-commit

| Feature | pi | opencode |
|---|---|---|
| Commit message generation | LLM via `pi -p` | File-name based (fast, no extra LLM call) |
| Amend prompt | Interactive select (fix vs build) | Auto-amends with toast notification |
| Scrap | `/scrap` command | `scrap` tool (agent can invoke it) |
| Event hook | `agent_end` with message inspection | `session.idle` event + SDK message fetch |
