/**
 * Auto-Commit Plugin for opencode
 *
 * After each agent turn completes (session.idle), inspects the session's
 * messages for file-write/edit tool calls, groups touched files by git repo,
 * and auto-commits with an "AI:" prefix.
 *
 * When the same repo is touched in consecutive turns, automatically amends
 * the previous commit (with a toast notification).
 *
 * Registers a "scrap" tool that undoes the last auto-commit and stashes changes.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { resolve, dirname } from "node:path";

// Tool names that write files (built-in opencode tools)
const FILE_WRITE_TOOLS = new Set([
  "write",
  "edit",
  "file_write",
  "file_edit",
  "patch",
  "multi_edit",
]);

const plugin: Plugin = async ({ client, $, worktree }) => {
  // Track last auto-commit per repo: repoRoot -> { sha, message }
  const lastAutoCommit = new Map<string, { sha: string; message: string }>();

  // Track which assistant message we last processed to avoid double-firing
  let lastProcessedMessageId: string | undefined;

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;

      const sessionID = event.properties.sessionID;

      try {
        // Get the session's messages to find file-editing tool calls
        const messagesResult = await client.session.messages({
          path: { id: sessionID },
          throwOnError: true,
        });

        const messages = messagesResult.data;
        if (!messages || messages.length === 0) return;

        // Find the last assistant message
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.info.role === "assistant");
        if (!lastAssistant) return;

        // Skip if we already processed this message
        if (lastAssistant.info.id === lastProcessedMessageId) return;
        lastProcessedMessageId = lastAssistant.info.id;

        // Collect edited file paths from tool parts in the last assistant message
        const editedFiles = new Set<string>();

        for (const part of lastAssistant.parts) {
          if (part.type !== "tool") continue;
          if (!FILE_WRITE_TOOLS.has(part.tool)) continue;
          if (part.state.status !== "completed") continue;

          const input = part.state.input;
          const filePath =
            (input as any)?.path ??
            (input as any)?.file ??
            (input as any)?.filePath;
          if (typeof filePath === "string") {
            editedFiles.add(resolve(worktree, filePath));
          }
        }

        if (editedFiles.size === 0) return;

        // Group files by git repo root
        const repoFiles = new Map<string, string[]>();

        for (const file of editedFiles) {
          try {
            const result = await $`git -C ${dirname(file)} rev-parse --show-toplevel`
              .quiet()
              .nothrow();
            if (result.exitCode !== 0) continue;

            const root = result.text().trim();
            if (!repoFiles.has(root)) repoFiles.set(root, []);
            repoFiles.get(root)!.push(file);
          } catch {
            continue;
          }
        }

        if (repoFiles.size === 0) return;

        for (const [repoRoot, files] of repoFiles) {
          // Stage only the files we touched
          for (const file of files) {
            await $`git -C ${repoRoot} add ${file}`.quiet().nothrow();
          }

          // Check if there's anything staged
          const diffStat = await $`git -C ${repoRoot} diff --cached --stat`
            .quiet()
            .nothrow();
          if (!diffStat.text().trim()) continue;

          // Build commit message from the stat summary
          const commitMessage = buildCommitMessage(diffStat.text());

          // Check if we have a previous auto-commit for this repo
          const prev = lastAutoCommit.get(repoRoot);
          let amend = false;

          if (prev) {
            // Verify the previous auto-commit is still HEAD
            const headResult = await $`git -C ${repoRoot} rev-parse HEAD`
              .quiet()
              .nothrow();
            const headSha = headResult.text().trim();

            if (headSha === prev.sha) {
              amend = true;
              await client.tui.showToast({
                body: {
                  message: `Amending previous commit. Use scrap tool to undo.`,
                  variant: "info",
                  duration: 4000,
                },
              });
            }
          }

          // Commit
          let commitResult;
          if (amend) {
            commitResult = await $`git -C ${repoRoot} commit --amend -m ${commitMessage}`
              .quiet()
              .nothrow();
          } else {
            commitResult = await $`git -C ${repoRoot} commit -m ${commitMessage}`
              .quiet()
              .nothrow();
          }

          if (commitResult.exitCode === 0) {
            const newHead = await $`git -C ${repoRoot} rev-parse HEAD`
              .quiet()
              .nothrow();
            lastAutoCommit.set(repoRoot, {
              sha: newHead.text().trim(),
              message: commitMessage,
            });

            const verb = amend ? "Amended" : "Committed";
            const fileCount = files.length;
            await client.tui.showToast({
              body: {
                message: `${verb} ${fileCount} file${fileCount > 1 ? "s" : ""}: ${commitMessage}`,
                variant: "success",
                duration: 5000,
              },
            });
          }
        }
      } catch (err) {
        console.error("[auto-commit]", err);
      }
    },

    tool: {
      scrap: {
        description:
          "Undo the last auto-commit: reset the commit and stash the changes. Use when the user wants to discard or redo work.",
        args: {},
        async execute() {
          if (lastAutoCommit.size === 0) {
            return "No auto-commits to scrap.";
          }

          // Find the most recent auto-commit that's still HEAD
          let targetRepo: string | undefined;
          let targetInfo: { sha: string; message: string } | undefined;

          for (const [root, info] of lastAutoCommit) {
            const headResult = await $`git -C ${root} rev-parse HEAD`
              .quiet()
              .nothrow();
            if (headResult.text().trim() === info.sha) {
              targetRepo = root;
              targetInfo = info;
              break;
            }
          }

          if (!targetRepo || !targetInfo) {
            return "HEAD has moved since the last auto-commit — can't scrap safely.";
          }

          // Reset the commit, keep changes staged
          await $`git -C ${targetRepo} reset --soft HEAD~1`.quiet().nothrow();

          // Stash the changes
          const stashMsg = `opencode: scrapped — ${targetInfo.message}`;
          await $`git -C ${targetRepo} stash push -m ${stashMsg}`
            .quiet()
            .nothrow();

          lastAutoCommit.delete(targetRepo);

          await client.tui.showToast({
            body: {
              message: `Scrapped and stashed: ${stashMsg}`,
              variant: "info",
              duration: 5000,
            },
          });

          return `Scrapped and stashed: ${stashMsg}`;
        },
      },
    },
  };
};

/**
 * Build a commit message from `git diff --stat` output.
 * Extracts file names and summarizes them.
 */
function buildCommitMessage(stat: string): string {
  const files = stat
    .split("\n")
    .map((line) => line.trim().split("|")[0]?.trim())
    .filter(
      (f) =>
        f &&
        !f.includes("changed") &&
        !f.includes("insertion") &&
        !f.includes("deletion") &&
        f.length > 0,
    );

  if (files.length === 0) return "AI: Update files";

  const fileNames = files.map((f) => f.split("/").pop()!);

  if (fileNames.length === 1) {
    return `AI: Update ${fileNames[0]}`;
  }

  let msg = `AI: Update ${fileNames.join(", ")}`;
  if (msg.length > 72) {
    msg = `AI: Update ${fileNames[0]} and ${fileNames.length - 1} more`;
    if (msg.length > 72) {
      msg = `AI: Update ${fileNames.length} files`;
    }
  }
  return msg;
}

export default plugin;
