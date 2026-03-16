---
description: QA-only — run all QA agents in parallel on the current state of the code
---
Use the subagent tool with the tasks parameter (parallel mode) to run QA on the codebase:

- "code-quality" agent with task: "Review the codebase focusing on: $@"
- "plan-checker" agent with task: "Check if the implementation is complete and correct for: $@"
- "ui-qa" agent with task: "Test the UI for: $@"

Report all findings. Do not make any changes.
