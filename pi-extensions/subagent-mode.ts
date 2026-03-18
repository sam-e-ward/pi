/**
 * Subagent Mode - Toggle between "free" and "paid" per-agent models
 *
 * Models are configured in models/agents.json:
 *   { agent_name: { paid: "model", free: "model" }, ... }
 *
 * Usage: /agent-mode free   (use free models for all agents)
 *        /agent-mode paid   (use paid models for all agents)
 *        /agent-mode        (show current mode and per-agent models)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type SubagentMode = "free" | "paid";

interface AgentModelEntry {
	paid: string;
	free: string;
}

function loadAgentModels(): Record<string, AgentModelEntry> {
	const extDir = import.meta.dirname || __dirname;
	const repoRoot = path.resolve(extDir, "..");
	const filePath = path.join(repoRoot, "models", "agents.json");
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		const result: Record<string, AgentModelEntry> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (!key.startsWith("_") && typeof value === "object" && value !== null) {
				result[key] = value as AgentModelEntry;
			}
		}
		return result;
	} catch {
		return {};
	}
}

export default function (pi: ExtensionAPI) {
	let currentMode: SubagentMode = "paid";

	function applyMode(mode: SubagentMode) {
		process.env.PI_SUBAGENT_MODE = mode;
		delete process.env.PI_SUBAGENT_MODEL;
	}

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		for (const entry of entries) {
			if (entry.type === "custom" && entry.customType === "subagent-mode") {
				const mode = entry.data?.mode as SubagentMode | undefined;
				if (mode === "free" || mode === "paid") {
					currentMode = mode;
				}
			}
		}
		applyMode(currentMode);
		updateUI(ctx);
	});

	function updateUI(ctx: any) {
		const icon = currentMode === "free" ? "🆓" : "💰";
		const config = loadAgentModels();
		const defaultModel = config["default"]?.[currentMode] ?? "(none)";
		ctx.ui.setStatus("subagent-mode", `${icon} ${currentMode}: ${defaultModel}`);
	}

	pi.registerCommand("agent-mode", {
		description: "Toggle subagent model mode (free/paid)",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();

			if (arg === "free" || arg === "paid") {
				currentMode = arg as SubagentMode;
				applyMode(currentMode);
				pi.appendEntry("subagent-mode", { mode: currentMode });
				const config = loadAgentModels();
				const lines = Object.entries(config)
					.filter(([k]) => k !== "_comment")
					.map(([agent, entry]) => `  ${agent}: ${entry[currentMode]}`)
					.join("\n");
				ctx.ui.notify(`Subagent mode: ${currentMode}\n${lines}`, "success");
				updateUI(ctx);
				return;
			}

			if (arg === "") {
				const config = loadAgentModels();
				const lines = Object.entries(config)
					.filter(([k]) => k !== "_comment")
					.map(([agent, entry]) => `  ${agent}: ${entry[currentMode]}`)
					.join("\n");
				ctx.ui.notify(`Current mode: ${currentMode}\n${lines}`, "info");
				return;
			}

			ctx.ui.notify("Usage: /agent-mode [free|paid]", "error");
		},
	});
}
