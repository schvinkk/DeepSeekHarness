/**
 * @deepseek-ai/dsh-plugin-suite — DeepSeek Harness Plugin Suite v2.95.27
 *
 * A standard DSH profile bundle that registers 40+ model-facing tools across
 * 15 plugin areas: browser control, GitHub, computer use, web app generation,
 * Figma, documents, presentations, spreadsheets, video, vision AI, file
 * upload, MCP marketplace, skill market, and context compression.
 *
 * Cordis plugin contract: exports `{ name, inject, Config, apply }`.
 */

import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

import { registerBrowserTools } from "./browser.js";
import { registerGitHubTools } from "./github.js";
import { registerComputerTools } from "./computer.js";
import { registerDocumentTools } from "./documents.js";
import { registerPresentationTools } from "./presentations.js";
import { registerSpreadsheetTools } from "./spreadsheets.js";
import { registerVisionTools } from "./vision.js";
import { registerFileTools } from "./files.js";
import { registerWebAppTools } from "./webapp.js";
import { registerVideoTools } from "./video.js";
import { registerMCPTools } from "./mcp.js";
import { registerSkillTools } from "./skills.js";
import { registerContextTools } from "./context.js";

/** Cordis plugin name used by loader diagnostics. */
export const name = "plugin-suite";

/** Services required by the plugin suite. */
export const inject = ["tools", "systemPrompt"];

/** Plugin configuration schema. */
export const Config = z.object({
	uploadDir: z.string().default("%TEMP%/dsh-uploads"),
	maxImageBytes: z.number().default(20 * 1024 * 1024),
	contextThreshold: z.number().default(0.85)
});

/**
 * Register every plugin tool on `ctx.tools` and add model guidance to the
 * system prompt.
 * @param ctx - the plugin context (Cordis).
 * @param config - resolved plugin configuration.
 */
export function apply(ctx, config) {
	const resolved = config;

	registerBrowserTools(ctx);
	registerGitHubTools(ctx);
	registerComputerTools(ctx);
	registerDocumentTools(ctx);
	registerPresentationTools(ctx);
	registerSpreadsheetTools(ctx);
	registerVisionTools(ctx, resolved);
	registerFileTools(ctx, resolved);
	registerWebAppTools(ctx);
	registerVideoTools(ctx);
	registerMCPTools(ctx);
	registerSkillTools(ctx);
	registerContextTools(ctx, resolved);

	ctx.systemPrompt.section({
		name: "plugin-suite",
		order: 100,
		text: [
			"The DeepSeek Harness Plugin Suite is available:",
			"- browser_navigate/browser_search: open and inspect web pages.",
			"- github_*: work with GitHub repositories, issues, and PRs.",
			"- document_*/presentation_*/spreadsheet_*: generate PRDs, proposals, meeting notes, reports, slide decks, and analyze CSV data.",
			"- vision_analyze_image: inspect image files (format, dimensions, colors, OCR when a vision model is configured).",
			"- file_upload/file_read/file_list: upload and inspect any file.",
			"- webapp_generate: scaffold a complete HTML web app from a description.",
			"- mcp_list/mcp_install and skill_list/skill_use: marketplace discovery.",
			"- context_status/context_compress: monitor and compress the conversation when the context is near full."
		].join("\n")
	});
}

/** Re-export defineTool for internal modules. */
export { defineTool };
