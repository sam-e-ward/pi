---
description: Full team workflow — scout → plan → develop → QA (code quality + UI) → developer fixes
---
Use the subagent tool with the chain parameter to execute this team workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the scout's context (use {previous} placeholder)
3. Then, use the "developer" agent to implement the plan from the previous step (use {previous} placeholder)
4. Then, run two QA agents in PARALLEL using the tasks parameter:
   - "code-quality" agent: Review the implementation. Context from developer: {previous}
   - "ui-qa" agent: Test the UI changes if applicable. Context from developer: {previous}
5. Finally, use the "developer" agent to address all feedback from the QA agents (use {previous} placeholder)

For steps 1-3 and 5, use chain mode. For step 4, use parallel mode.

Since the subagent tool only supports one mode per call, execute this as:
- First call: chain with steps 1, 2, 3
- Second call: parallel with the two QA tasks, passing the chain output as context in each task
- Third call: single developer agent to address QA feedback
