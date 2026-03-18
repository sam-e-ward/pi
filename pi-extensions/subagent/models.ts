/**
 * Per-agent model resolution from models/agents.json.
 *
 * Config format: { agent_name: { paid: "model", free: "model" }, ... }
 * PI_SUBAGENT_MODE selects "free" or "paid" (default: "paid").
 * PI_SUBAGENT_MODEL still works as a global override.
 * Agent frontmatter `model:` overrides everything.
 *
 * "default" key is the fallback for agents not listed in the config.
 * No fallback chains — each agent gets exactly one model.
 */

import * as fs from "node:fs";
import * as path from "node:path";

type AgentMode = "free" | "paid";

interface AgentModelEntry {
	paid: string;
	free: string;
}

interface AgentModelsConfig {
	[agentName: string]: AgentModelEntry;
}

let cachedConfig: AgentModelsConfig | null = null;
let cachedConfigMtime: number = 0;

/**
 * Find the models directory by walking up from this file's location.
 */
function findModelsDir(): string | null {
	let dir = path.resolve(import.meta.dirname || __dirname, "..", "..");
	for (let i = 0; i < 5; i++) {
		const candidate = path.join(dir, "models");
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
			return candidate;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/**
 * Load and cache agents.json config. Reloads if file has changed.
 */
function loadConfig(): AgentModelsConfig {
	const modelsDir = findModelsDir();
	if (!modelsDir) return {};

	const filePath = path.join(modelsDir, "agents.json");
	try {
		const stat = fs.statSync(filePath);
		if (cachedConfig && stat.mtimeMs === cachedConfigMtime) {
			return cachedConfig;
		}
		const content = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(content);
		// Strip _comment keys
		const config: AgentModelsConfig = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (!key.startsWith("_") && typeof value === "object" && value !== null) {
				config[key] = value as AgentModelEntry;
			}
		}
		cachedConfig = config;
		cachedConfigMtime = stat.mtimeMs;
		return config;
	} catch {
		return {};
	}
}

/**
 * Resolve the model for a specific agent.
 *
 * Priority:
 * 1. PI_SUBAGENT_MODEL env var → global override
 * 2. Agent frontmatter model → agent-specific override
 * 3. agents.json[agentName][mode] → per-agent config
 * 4. agents.json["default"][mode] → default config
 * 5. undefined → use pi's default model
 */
export function resolveModel(agentName: string, agentFrontmatterModel?: string): string | undefined {
	// Global env override
	const envModel = process.env.PI_SUBAGENT_MODEL;
	if (envModel) return envModel;

	// Agent frontmatter override
	if (agentFrontmatterModel) return agentFrontmatterModel;

	// Load config and resolve by mode
	const config = loadConfig();
	const mode: AgentMode = (process.env.PI_SUBAGENT_MODE as AgentMode) || "paid";

	const agentEntry = config[agentName];
	if (agentEntry && agentEntry[mode]) return agentEntry[mode];

	const defaultEntry = config["default"];
	if (defaultEntry && defaultEntry[mode]) return defaultEntry[mode];

	return undefined;
}

/**
 * Get the current mode and the full config for display purposes.
 */
export function getModelConfig(): { mode: string; config: AgentModelsConfig } {
	return {
		mode: process.env.PI_SUBAGENT_MODE || "paid",
		config: loadConfig(),
	};
}
