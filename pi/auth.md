# Authentication

Pi reads provider credentials from `~/.pi/agent/auth.json`.

Create the file with entries for whichever providers you use:

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "sk-ant-..."
  },
  "openai": {
    "type": "api_key",
    "key": "sk-..."
  },
  "google": {
    "type": "api_key",
    "key": "AIza..."
  },
  "openrouter": {
    "type": "api_key",
    "key": "sk-or-..."
  }
}
```

The `key` value can be:

- A literal API key
- An environment variable name (e.g. `"ANTHROPIC_API_KEY"`) — resolved at runtime
- A `!command` to execute (e.g. `"!op read op://vault/anthropic/key"`)

Only include the providers you need.
