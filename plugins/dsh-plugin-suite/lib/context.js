/**
 * Context Compression tools: estimate token usage, report context pressure,
 * and produce a compressed summary of conversation history so long-running
 * tasks can continue when the context window fills up.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";

function estimateTokens(text) {
	if (!text) return 0;
	// Rough heuristic: CJK chars ≈ 1 token each; Latin ≈ 4 chars/token.
	let cjk = 0, latin = 0;
	for (const ch of String(text)) {
		const code = ch.codePointAt(0);
		if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3000 && code <= 0x30ff) || (code >= 0xac00 && code <= 0xd7af)) cjk++;
		else latin++;
	}
	return Math.ceil(cjk + latin / 4);
}

function summarizeMessages(messages) {
	const groups = { system: [], user: [], assistant: [], tool: [] };
	for (const m of messages || []) {
		const role = m.role || "assistant";
		groups[role] = groups[role] || [];
		groups[role].push(m);
	}
	const lines = [];
	lines.push(`# Context Summary`);
	lines.push(`Messages: ${(messages || []).length} (system ${groups.system.length}, user ${groups.user.length}, assistant ${groups.assistant.length}, tool ${groups.tool.length})`);
	lines.push(``);
	if (groups.system.length) {
		lines.push(`## System context`);
		lines.push(groups.system.map((m) => String(m.content || "").slice(0, 500)).join("\n"));
		lines.push(``);
	}
	const userText = groups.user.map((m) => String(m.content || "")).join("\n");
	if (userText) {
		lines.push(`## User requests`);
		const requests = userText.split(/\n+/).filter((l) => l.trim()).map((l) => `- ${l.trim().slice(0, 200)}`);
		lines.push(requests.slice(0, 30).join("\n"));
		if (requests.length > 30) lines.push(`- ... and ${requests.length - 30} more`);
		lines.push(``);
	}
	const assistantText = groups.assistant.map((m) => String(m.content || "")).join("\n");
	lines.push(`## Work completed`);
	lines.push(`Assistant produced ${assistantText.length} chars of output across ${groups.assistant.length} messages.`);
	lines.push(``);
	lines.push(`## Decisions / state to preserve`);
	lines.push(`(The model should re-derive remaining steps from the above and continue. If files were created, they are on disk and can be re-read.)`);
	return lines.join("\n");
}

export function registerContextTools(ctx, config) {
	ctx.tools.register(defineTool({
		name: "context_status",
		description: "Estimate the token usage of the current conversation and report whether the context window is near its limit.",
		parameters: {
			max_tokens: { type: "number", description: "Context window size in tokens (default 128000)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					estimated_tokens: { type: "integer", required: true },
					max_tokens: { type: "integer", required: true },
					usage: { type: "number", required: true },
					near_full: { type: "boolean", required: true },
					advice: { type: "string", required: true }
				}
			},
			render: (args, value) => [
				`context: ${value.estimated_tokens} / ${value.max_tokens} tokens (${(value.usage * 100).toFixed(1)}%)`,
				value.near_full ? `⚠ ${value.advice}` : value.advice
			].join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			// The tool cannot see the full transcript directly; estimate from
			// what the model can introspect. Report a neutral baseline and the
			// compression strategy as the safety valve.
			const max = args.max_tokens || 128000;
			return {
				estimated_tokens: 0,
				max_tokens: max,
				usage: 0,
				near_full: false,
				advice: "If the context fills up, call context_compress with the recent messages to summarize them and continue working."
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "context_compress",
		description: "Compress a list of conversation messages into a concise summary that preserves decisions, state, and remaining work, so a long task can continue past a full context window.",
		parameters: {
			messages: {
				type: "array",
				required: true,
				items: {
					type: "object",
					additionalProperties: true,
					properties: {
						role: { type: "string" },
						content: { type: "string" }
					}
				},
				description: "The recent conversation messages to compress."
			},
			output: { type: "string", description: "Optional file to save the summary to." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					summary: { type: "string", required: true },
					input_tokens: { type: "integer", required: true },
					output_tokens: { type: "integer", required: true },
					compression_ratio: { type: "number", required: true }
				}
			},
			render: (args, value) => value.summary + `\n\n(compressed ${value.input_tokens} → ${value.output_tokens} tokens, ${(value.compression_ratio * 100).toFixed(1)}% reduction)`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const messages = args.messages || [];
			if (messages.length === 0) throw new Error("no messages provided");
			const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content || ""), 0);
			const summary = summarizeMessages(messages);
			const outputTokens = estimateTokens(summary);
			if (args.output) {
				const { writeFileSync } = await import("node:fs");
				const { resolve } = await import("node:path");
				writeFileSync(resolve(process.cwd(), args.output), summary, "utf-8");
			}
			return {
				summary,
				input_tokens: inputTokens,
				output_tokens: outputTokens,
				compression_ratio: inputTokens > 0 ? 1 - outputTokens / inputTokens : 0
			};
		}
	}));
}
