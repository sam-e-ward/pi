import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";

const VM_PORT = process.env.VM_PORT ?? "8481";
const VM_BASE = `http://localhost:${VM_PORT}/select/0/prometheus/api/v1`;
const KNOWLEDGE_DIR = `${process.env.HOME}/.pi/vm-knowledge`;

function vmGet(path: string, timeout_ms = 30_000): string {
	const url = `${VM_BASE}${path}`;
	// Only ever HTTP GET against localhost — nothing else is possible here
	return execSync(`curl -sf --max-time ${Math.ceil(timeout_ms / 1000)} '${url}'`, {
		encoding: "utf-8",
		timeout: timeout_ms + 2_000,
	});
}

function checkConnectivity(): string | null {
	try {
		vmGet("/query?query=up&limit=1", 5_000);
		return null;
	} catch {
		return [
			`Cannot reach VictoriaMetrics at localhost:${VM_PORT}.`,
			"",
			"Start a port-forward first:",
			`  kubectl port-forward -n <monitoring-namespace> svc/<vmselect-service> ${VM_PORT}:8481 &`,
		].join("\n");
	}
}

function encodeQuery(query: string): string {
	return encodeURIComponent(query);
}

function formatJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

function truncateResult(text: string, max_lines = 200): { text: string; truncated: boolean } {
	const lines = text.split("\n");
	if (lines.length <= max_lines) return { text, truncated: false };
	return {
		text: lines.slice(0, max_lines).join("\n") + `\n\n... truncated (${lines.length} total lines, showing first ${max_lines})`,
		truncated: true,
	};
}

export default function (pi: ExtensionAPI) {
	// ── vm_query ────────────────────────────────────────────────────────
	pi.registerTool({
		name: "vm_query",
		label: "VM Query",
		description:
			"Run a PromQL query against VictoriaMetrics. Supports instant and range queries. " +
			"This is a read-only tool that queries metrics via HTTP GET to localhost.",
		promptSnippet: "Run PromQL queries against VictoriaMetrics (instant or range)",
		promptGuidelines: [
			"Use vm_query for all VictoriaMetrics/Prometheus metric queries — never use bash/curl directly.",
			"Always wrap _total metrics in rate() or increase().",
			"Use topk() to limit large result sets.",
			"Use range mode with start/end/step for time-series investigation.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "PromQL expression" }),
			range: Type.Optional(
				Type.Boolean({
					description: "Use range query instead of instant (default: false)",
				})
			),
			start: Type.Optional(
				Type.String({
					description: "Start time for range queries (RFC3339, unix timestamp, or relative like -1h)",
				})
			),
			end: Type.Optional(
				Type.String({
					description: "End time for range queries (default: now)",
				})
			),
			step: Type.Optional(
				Type.String({
					description: "Step for range queries (default: 60s)",
				})
			),
		}),

		async execute(_tool_call_id, params) {
			const err = checkConnectivity();
			if (err) {
				return {
					content: [{ type: "text" as const, text: err }],
					isError: true,
					details: {},
				};
			}

			const encoded = encodeQuery(params.query);
			let path: string;

			if (params.range) {
				const parts = [`query=${encoded}`];
				if (params.start) parts.push(`start=${encodeURIComponent(params.start)}`);
				if (params.end) parts.push(`end=${encodeURIComponent(params.end)}`);
				parts.push(`step=${params.step ?? "60s"}`);
				path = `/query_range?${parts.join("&")}`;
			} else {
				path = `/query?query=${encoded}`;
			}

			try {
				const raw = vmGet(path);
				const formatted = formatJson(raw);
				const { text, truncated } = truncateResult(formatted);
				return {
					content: [{ type: "text" as const, text }],
					details: { query: params.query, truncated },
				};
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					content: [{ type: "text" as const, text: `Query failed: ${msg}` }],
					isError: true,
					details: { query: params.query },
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("vm_query "));
			const mode = args.range ? "range" : "instant";
			text += theme.fg("muted", `(${mode}) `);
			text += theme.fg("dim", args.query);
			if (args.range && args.start) {
				text += theme.fg("muted", ` [${args.start}..${args.end ?? "now"}, step=${args.step ?? "60s"}]`);
			}
			return new Text(text, 0, 0);
		},
	});

	// ── vm_labels ───────────────────────────────────────────────────────
	pi.registerTool({
		name: "vm_labels",
		label: "VM Labels",
		description:
			"Discover available label names, values for a label, or series matching a metric. " +
			"Read-only — queries VictoriaMetrics via HTTP GET to localhost.",
		promptSnippet: "Discover VictoriaMetrics label names, values, and series",
		parameters: Type.Object({
			action: StringEnum(["names", "values", "series"] as const, {
				description: "names: list all label names, values: list values for a label, series: list series matching a selector",
			}),
			label: Type.Optional(
				Type.String({
					description: "Label name (required for 'values' action)",
				})
			),
			match: Type.Optional(
				Type.String({
					description: "Metric name or series selector (required for 'series' action, e.g. 'node_memory_MemTotal_bytes' or '{job=\"node-exporter\"}')",
				})
			),
			limit: Type.Optional(
				Type.Number({
					description: "Max series to return for 'series' action (default: 10)",
				})
			),
		}),

		async execute(_tool_call_id, params) {
			const err = checkConnectivity();
			if (err) {
				return {
					content: [{ type: "text" as const, text: err }],
					isError: true,
					details: {},
				};
			}

			try {
				let raw: string;

				switch (params.action) {
					case "names":
						raw = vmGet("/labels");
						break;
					case "values": {
						if (!params.label) {
							return {
								content: [{ type: "text" as const, text: "Error: 'label' parameter is required for 'values' action" }],
								isError: true,
								details: {},
							};
						}
						raw = vmGet(`/label/${encodeURIComponent(params.label)}/values`);
						break;
					}
					case "series": {
						if (!params.match) {
							return {
								content: [{ type: "text" as const, text: "Error: 'match' parameter is required for 'series' action" }],
								isError: true,
								details: {},
							};
						}
						const limit = params.limit ?? 10;
						raw = vmGet(`/series?match[]=${encodeQuery(params.match)}&limit=${limit}`);
						break;
					}
				}

				const formatted = formatJson(raw);
				const { text } = truncateResult(formatted);
				return {
					content: [{ type: "text" as const, text }],
					details: { action: params.action },
				};
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					content: [{ type: "text" as const, text: `Labels query failed: ${msg}` }],
					isError: true,
					details: {},
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("vm_labels "));
			text += theme.fg("muted", args.action);
			if (args.label) text += " " + theme.fg("dim", args.label);
			if (args.match) text += " " + theme.fg("dim", args.match);
			return new Text(text, 0, 0);
		},
	});
}
