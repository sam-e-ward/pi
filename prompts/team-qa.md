---
description: QA-only — review current state of the code (no changes made)
---
Use the subagent tool to run QA on the codebase. Run each sequentially in single mode.

1. "code-review" agent: "Review the codebase focusing on: $@"

2. "plan-checker" agent — only if a plan or requirements doc is referenced in the task:
   "Verify implementation matches requirements for: $@"

3. "ui-qa" agent — only if the task involves UI:
   "Test UI for: $@"

Report all findings. Do not make any changes.
