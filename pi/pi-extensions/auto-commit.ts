/**
 * Auto-Commit Extension
 *
 * After every agent response, checks if any files were written/edited,
 * finds which git repos they belong to, and auto-commits with an "AI:" prefix.
 *
 * When the same repo is touched in consecutive agent responses, asks the user
 * whether to amend the previous commit (fix) or create a new one (build on it).
 *
 * Provides /scrap command to undo the last auto-commit and stash changes.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolve, dirname } from "node:path";

export default function (pi: ExtensionAPI) {
	// Track last auto-commit per repo: repoRoot -> { sha, message }
	const lastAutoCommit = new Map<string, { sha: string; message: string }>();

	pi.on("agent_end", async (event, ctx) => {
		// Collect file paths from write/edit tool calls in this agent run
		const editedFiles = new Set<string>();

		for (const msg of event.messages) {
			if (msg.role === "assistant" && Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (block.type === "tool_use" || block.type === "toolCall") {
						if (block.name === "write" || block.name === "edit") {
							const filePath = block.input?.path ?? block.arguments?.path;
							if (typeof filePath === "string") {
								editedFiles.add(resolve(ctx.cwd, filePath));
							}
						}
					}
				}
			}
		}

		if (editedFiles.size === 0) return;

		// Group files by git repo root
		const repoFiles = new Map<string, string[]>();

		for (const file of editedFiles) {
			const { stdout, code } = await pi.exec("git", ["-C", dirname(file), "rev-parse", "--show-toplevel"], {
				timeout: 5000,
			});
			if (code !== 0) continue;

			const root = stdout.trim();
			if (!repoFiles.has(root)) repoFiles.set(root, []);
			repoFiles.get(root)!.push(file);
		}

		if (repoFiles.size === 0) return;

		for (const [repoRoot, files] of repoFiles) {
			// Stage only the files we touched
			for (const file of files) {
				await pi.exec("git", ["-C", repoRoot, "add", file], { timeout: 5000 });
			}

			// Check if there's anything staged
			const { stdout: diff } = await pi.exec("git", ["-C", repoRoot, "diff", "--cached", "--stat"], {
				timeout: 5000,
			});
			if (!diff.trim()) continue;

			// Build commit message from last assistant text
			const commitMessage = buildCommitMessage(event.messages);

			// Check if we have a previous auto-commit for this repo
			const prev = lastAutoCommit.get(repoRoot);
			let amend = false;

			if (prev && ctx.hasUI) {
				// Verify the previous auto-commit is still HEAD
				const { stdout: headSha } = await pi.exec("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
					timeout: 5000,
				});
				if (headSha.trim() === prev.sha) {
					const choice = await ctx.ui.select("Previous auto-commit exists for this repo", [
						"Amend — fold into previous commit (fix)",
						"New commit — keep previous, add another (build on it)",
					]);
					amend = choice?.startsWith("Amend") ?? false;
				}
			}

			let commitArgs: string[];
			if (amend) {
				commitArgs = ["-C", repoRoot, "commit", "--amend", "-m", commitMessage];
			} else {
				commitArgs = ["-C", repoRoot, "commit", "-m", commitMessage];
			}

			const { code, stdout: commitOut } = await pi.exec("git", commitArgs, { timeout: 10000 });

			if (code === 0) {
				// Record this auto-commit
				const { stdout: newSha } = await pi.exec("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
					timeout: 5000,
				});
				lastAutoCommit.set(repoRoot, { sha: newSha.trim(), message: commitMessage });

				if (ctx.hasUI) {
					const fileCount = files.length;
					const verb = amend ? "Amended" : "Auto-committed";
					ctx.ui.notify(
						`${verb} ${fileCount} file${fileCount > 1 ? "s" : ""} in ${repoRoot}: ${commitMessage}`,
						"info",
					);
				}
			}
		}
	});

	// /scrap command: undo last auto-commit, stash changes
	pi.registerCommand("scrap", {
		description: "Undo the last auto-commit: reset the commit and stash changes",
		handler: async (args, ctx) => {
			if (lastAutoCommit.size === 0) {
				ctx.ui.notify("No auto-commits to scrap", "warning");
				return;
			}

			// If multiple repos, let user pick; otherwise use the only one
			let repoRoot: string;
			if (lastAutoCommit.size === 1) {
				repoRoot = lastAutoCommit.keys().next().value!;
			} else {
				const choice = await ctx.ui.select(
					"Which repo to scrap?",
					[...lastAutoCommit.entries()].map(([root, { message }]) => `${root} — ${message}`),
				);
				if (!choice) return;
				repoRoot = choice.split(" — ")[0];
			}

			const prev = lastAutoCommit.get(repoRoot);
			if (!prev) return;

			// Verify it's still HEAD
			const { stdout: headSha } = await pi.exec("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
				timeout: 5000,
			});
			if (headSha.trim() !== prev.sha) {
				ctx.ui.notify("HEAD has moved since the auto-commit — can't scrap safely", "error");
				return;
			}

			// Reset the commit, keep changes in working tree
			await pi.exec("git", ["-C", repoRoot, "reset", "--soft", "HEAD~1"], { timeout: 5000 });

			// Stash the changes
			const stashMsg = `pi: scrapped auto-commit — ${prev.message}`;
			await pi.exec("git", ["-C", repoRoot, "stash", "push", "-m", stashMsg], { timeout: 5000 });

			lastAutoCommit.delete(repoRoot);
			ctx.ui.notify(`Scrapped and stashed: ${stashMsg}`, "info");
		},
	});

	// Clear tracking on new session
	pi.on("session_start", async () => {
		lastAutoCommit.clear();
	});
}

function buildCommitMessage(messages: Array<{ role: string; content: unknown }>): string {
	// Collect edited file paths for a fallback summary
	const editedFiles: string[] = [];
	for (const msg of messages) {
		if ((msg as any).role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content as any[]) {
				if ((block.type === "tool_use" || block.type === "toolCall") &&
					(block.name === "write" || block.name === "edit")) {
					const filePath = block.input?.path ?? block.arguments?.path;
					if (typeof filePath === "string") {
						editedFiles.push(filePath.split("/").pop()!);
					}
				}
			}
		}
	}

	// Gather all assistant text blocks (last message first)
	const textBlocks: string[] = [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content as any[]) {
				if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
					textBlocks.push(block.text.trim());
				}
			}
			if (textBlocks.length > 0) break; // only use last assistant message
		}
	}

	const rawText = textBlocks.join("\n");
	const summary = extractSummary(rawText, editedFiles);
	return `AI: ${summary}`;
}

/** Preamble patterns that don't make good commit messages */
const PREAMBLE_RE = /^(here('s| are|:)|i('ve| have| will| made| updated| changed|'ll)|done[.!]?|sure[.!,]|ok[.!,]|let me|now |the changes|two |three |four |five |six |seven |eight |nine |ten |\d+ changes?|changes?:|updates?:|summary:?|all done)/i;

/** Lines that are just list markers or very short */
const LIST_MARKER_RE = /^(\d+\.|[-*•])\s*/;

function extractSummary(rawText: string, editedFiles: string[]): string {
	if (!rawText) {
		return fileFallback(editedFiles);
	}

	const lines = rawText.split("\n")
		.map(l => l.replace(/[`*_~#>\[\]]/g, "").replace(/\s+/g, " ").trim())
		.filter(l => l.length > 0);

	// Strategy 1: If there's a single substantive line (after filtering preamble), use it
	// Strategy 2: Collect list items and join them
	// Strategy 3: Use first non-preamble line

	const substantiveLines: string[] = [];
	for (const line of lines) {
		if (PREAMBLE_RE.test(line) && line.endsWith(":")) continue; // skip "Here's what I did:" etc.
		if (line.length < 4) continue; // skip very short lines
		// Strip list markers
		const cleaned = line.replace(LIST_MARKER_RE, "").trim();
		if (cleaned.length >= 4) {
			substantiveLines.push(cleaned);
		}
	}

	let summary: string;

	if (substantiveLines.length === 0) {
		return fileFallback(editedFiles);
	} else if (substantiveLines.length === 1) {
		summary = substantiveLines[0];
	} else {
		// Multiple substantive lines — join with semicolons for a compact summary
		// But first check if the first line is already a good standalone summary
		const first = substantiveLines[0];
		if (!first.endsWith(":") && first.length >= 15 && !PREAMBLE_RE.test(first)) {
			summary = first;
		} else {
			// Join items, lowercasing the start of each for flow
			summary = substantiveLines
				.slice(0, 4) // max 4 items
				.map((s, i) => i === 0 ? s : lcFirst(s))
				.join("; ");
		}
	}

	return truncate(summary, 68);
}

function fileFallback(editedFiles: string[]): string {
	if (editedFiles.length === 0) return "Update files";
	const unique = [...new Set(editedFiles)];
	return truncate(`Update ${unique.join(", ")}`, 68);
}

function truncate(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 3) + "...";
}

function lcFirst(s: string): string {
	// Don't lowercase acronyms or paths
	if (s.length < 2 || s[1] === s[1].toUpperCase()) return s;
	return s[0].toLowerCase() + s.slice(1);
}
