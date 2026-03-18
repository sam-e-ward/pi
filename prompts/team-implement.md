---
description: Team workflow — scout → plan → develop → QA → fix
---
Use the subagent tool to execute this workflow for: $@

**Step 1: Chain — scout → plan → develop**
Use chain mode with these 3 agents:
1. "scout" agent: Find code relevant to: $@
2. "planner" agent: Create an implementation plan for "$@" using scout context. {previous}
3. "developer" agent: Implement the plan. {previous}

Save the developer's output. Extract two things from it:
- **changes**: the file list and one-line change descriptions
- **plan**: the plan from step 2 (already embedded in the chain output)

**Step 2: Sequential QA (3 calls, minimal context each)**

Call each agent in single mode, one at a time. Do NOT pass the full chain output — pass only what each agent needs.

a) "code-review" agent (combined quality + architecture):
   Task: "Review these changes: {changes}"

b) "plan-checker" agent:
   Task: "Plan: {plan}\n\nChanges: {changes}\n\nVerify the implementation matches the plan."

c) "ui-qa" agent:
   Task: "Changed files: {changes}\n\nTest UI changes if any UI files were modified."

**Step 3: Fix if needed**
Collect all issues from the 3 QA agents. Only if there are RETHINK, EXTRACT, or ARCH severity issues, OR the plan-checker says FAIL, OR ui-qa found Critical issues — use single mode with "developer" agent to address them. Pass only the issues list.

Otherwise report completion with the QA results.

⚠️ The key cost control: each QA agent gets ONLY the summary it needs, not the full developer output. Summarize aggressively.
