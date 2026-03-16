---
description: Iterative dev cycle — developer implements, code review, developer fixes (repeat until clean)
---
Use the subagent tool to run an iterative development cycle for: $@

Step 1: Use the subagent tool in single mode with "developer" agent to implement: $@

Step 2: Use the subagent tool in single mode with "code-quality" agent to review the implementation. Pass the developer's output as context in the task.

Step 3: If the code-quality agent found Critical or Warning issues, use the subagent tool in single mode with "developer" agent to address the feedback. Pass the review output as context.

Step 4: If fixes were needed, run one more "code-quality" review to verify.

Report the final status.
