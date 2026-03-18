---
description: Iterative dev cycle — develop → review → fix (one iteration)
---
Use the subagent tool to run a dev cycle for: $@

**Step 1:** Single mode — "developer" agent to implement: $@

**Step 2:** Single mode — "code-quality" agent to review. Pass only the **file list and change summary** from the developer (not the full output).

**Step 3:** Only if RETHINK or EXTRACT issues found, use "developer" agent to fix them. Pass only the issues list. Otherwise report clean.

One iteration only — no loops.
