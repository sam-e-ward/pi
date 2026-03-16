---
description: Team review — parallel QA (code quality + plan check + UI) on existing code, then developer fixes
---
Use the subagent tool to review and fix existing code. The task is: $@

Step 1: Run three QA agents in PARALLEL using the subagent tool's tasks parameter:
- "code-quality" agent with task: "Review the recent changes. $@"
- "plan-checker" agent with task: "Verify the implementation matches requirements. $@"
- "ui-qa" agent with task: "Test the UI for the recent changes. $@"

Step 2: After all QA agents finish, use the subagent tool in single mode with the "developer" agent to address all the feedback from the three QA agents. Include the full QA output in the task.
