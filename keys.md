# Authentication Keys & Tokens

This document lists every authentication credential required by the skills in this repository.

## Skills that require authentication

### GitHub (`skills/github`)

**What:** The `gh` CLI must be authenticated with GitHub.

**Setup:**
```bash
gh auth login
```

Follow the interactive prompts to authenticate via browser or token. This creates a config at `~/.config/gh/hosts.yml`.

**Scopes needed:** Depends on usage — at minimum `repo` for private repos, `read:org` for org queries. The interactive login flow will request appropriate scopes.

**Verify:**
```bash
gh auth status
```

---

### Sentry (`skills/sentry`)

**What:** A Sentry auth token stored in `~/.sentryclirc`.

**Setup:**

Option A — use the Sentry CLI:
```bash
sentry-cli login
```

Option B — create the file manually:
```ini
# ~/.sentryclirc
[auth]
token=sntrys_YOUR_TOKEN_HERE

[defaults]
org=your-org-slug
```

**How to get a token:** Go to [sentry.io/settings/auth-tokens](https://sentry.io/settings/auth-tokens/) and create a token with the scopes needed for your workflows (e.g. `event:read`, `project:read`, `org:read`).

**Verify:**
```bash
grep token ~/.sentryclirc
```

---

### Native Web Search (`skills/native-web-search`)

**What:** Uses pi's own authentication to call either the Anthropic API or OpenAI Codex API for web-search-enabled queries.

**Setup:** Credentials are read from `~/.pi/agent/auth.json`. This file is managed by pi itself. The structure looks like:

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "ANTHROPIC_API_KEY"
  }
}
```

or for OpenAI Codex, an OAuth entry with `access`/`refresh`/`expires` fields.

**How it works:**
- The script loads `auth.json` and picks a provider (Anthropic or OpenAI Codex).
- For `api_key` type entries, the `key` field can be a literal key, an environment variable name, or a `!command` to execute.
- For `oauth` type entries, it uses pi-ai's `getOAuthApiKey()` to refresh tokens automatically.

**If you only have an `ANTHROPIC_API_KEY` env var**, you can configure auth.json to reference it:
```json
{
  "anthropic": {
    "type": "api_key",
    "key": "ANTHROPIC_API_KEY"
  }
}
```
(When the value matches an env var name, the script resolves it from the environment.)

---

### Summarize (`skills/summarize`) — only for `--summary` flag

**What:** The `--summary` flag invokes `pi --model claude-haiku-4-5`, which requires pi to be authenticated with an Anthropic API key (or other configured provider).

**Setup:** Same as pi's own auth — typically the `ANTHROPIC_API_KEY` environment variable or `~/.pi/agent/auth.json`.

Without `--summary`, this skill just runs `uvx markitdown` locally and needs no credentials.

---

## Skills that do NOT require authentication

| Skill | Notes |
|---|---|
| **commit** | Uses local `git` only |
| **frontend-design** | Design guidelines — no external services |
| **librarian** | Uses `git clone`; may need SSH keys or `gh` auth for private repos |
| **mermaid** | Local Mermaid CLI (`npx @mermaid-js/mermaid-cli`) |
| **playwright** | Local Playwright browser automation (`npx playwright`) — no API keys |
| **tmux** | Local tmux sessions |
| **update-changelog** | Uses local `git` only |
| **uv** | Local Python package manager |
| **web-browser** | Controls local Chrome via CDP on port 9222 — no API keys |

---

## Quick checklist

```bash
# 1. GitHub — authenticate the gh CLI
gh auth login
gh auth status

# 2. Sentry — ensure ~/.sentryclirc exists with a valid token
cat ~/.sentryclirc

# 3. Pi agent auth — ensure ~/.pi/agent/auth.json has provider credentials
#    (managed by pi itself, or manually for API key setups)
ls ~/.pi/agent/auth.json
```
