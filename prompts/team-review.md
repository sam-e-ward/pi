---
description: Team review — full QA on existing code, then developer fixes
---
Use the subagent tool to review and fix existing code for: $@

**Step 1: Sequential QA** (single mode, one at a time)

a) "code-review" agent: "Review the recent changes. $@"

b) "plan-checker" agent — only if requirements/plan context is available:
   "Verify implementation matches the plan. $@"

c) "ui-qa" agent — only if the task involves UI:
   "Test UI for recent changes. $@"

**Step 2: Fix if needed**
Collect all issues. Only if RETHINK/EXTRACT/ARCH issues or plan-checker FAIL or ui-qa Critical issues exist, use "developer" agent to fix. Pass only the issues list.

Otherwise report the QA results as-is.
