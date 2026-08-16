/**
 * Skill Market tools: discover and apply agent skills from a built-in catalog
 * that mirrors popular open-source skill collections (web search, code review,
 * data analysis, content writing, translation, API design, testing, DevOps,
 * security audit, performance). Skills persist to %USERPROFILE%\.dsh\skills.json.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILLS_PATH = join(process.env.USERPROFILE || process.env.HOME || ".", ".dsh", "skills.json");

const BUILTIN_SKILLS = [
	{ id: "web-search", name: "Web Search", category: "search", description: "Search the web for current information", instructions: "Use browser_search or web_search to find up-to-date information before answering." },
	{ id: "code-review", name: "Code Review", category: "development", description: "Review code for bugs, security, and best practices", instructions: "Read the code with the read tool, then report issues by severity with concrete fixes." },
	{ id: "data-analysis", name: "Data Analysis", category: "analytics", description: "Analyze datasets and produce insights", instructions: "Use spreadsheet_analyze to compute statistics, then interpret results and propose actions." },
	{ id: "content-writing", name: "Content Writing", category: "content", description: "Write engaging marketing and blog content", instructions: "Write clear, structured, audience-appropriate content with a strong headline and call to action." },
	{ id: "translation", name: "Translation", category: "language", description: "Translate between languages accurately", instructions: "Translate preserving tone, idiom, and locale conventions; note any ambiguity." },
	{ id: "api-design", name: "API Design", category: "development", description: "Design RESTful APIs with best practices", instructions: "Define resources, methods, status codes, error shapes, and OpenAPI-compatible schemas." },
	{ id: "database-design", name: "Database Design", category: "development", description: "Design schemas and optimize queries", instructions: "Normalize where useful, index hot paths, and document constraints and relationships." },
	{ id: "testing", name: "Testing", category: "development", description: "Write unit/integration tests and test plans", instructions: "Cover happy path, edge cases, and failure modes; keep tests fast and deterministic." },
	{ id: "devops", name: "DevOps", category: "operations", description: "CI/CD, Docker, and deployment automation", instructions: "Provide container/CI files and deployment steps; pin versions and avoid secrets in config." },
	{ id: "security-audit", name: "Security Audit", category: "security", description: "Find vulnerabilities and compliance issues", instructions: "Check injection, XSS, auth, secrets handling, and dependency advisories; rank findings by risk." },
	{ id: "performance", name: "Performance Optimization", category: "development", description: "Find and fix performance bottlenecks", instructions: "Profile first, optimize hot paths, and measure before/after." },
	{ id: "image-generation", name: "Image Generation", category: "creative", description: "Generate images from descriptions", instructions: "Write detailed prompts; use vision tools to review generated images." }
];

function loadInstalled() {
	if (!existsSync(SKILLS_PATH)) return {};
	try {
		return JSON.parse(readFileSync(SKILLS_PATH, "utf-8"));
	} catch {
		return {};
	}
}

function saveInstalled(installed) {
	mkdirSync(join(SKILLS_PATH, ".."), { recursive: true });
	writeFileSync(SKILLS_PATH, JSON.stringify(installed, null, 2), "utf-8");
}

export function registerSkillTools(ctx) {
	ctx.tools.register(defineTool({
		name: "skill_list",
		description: "List available skills from the skill market.",
		parameters: {
			category: { type: "string", description: "Optional category filter." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					skills: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string", required: true },
								name: { type: "string", required: true },
								category: { type: "string", required: true },
								description: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => value.skills.map((s) => `[${s.category}] ${s.id} — ${s.description}`).join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const skills = BUILTIN_SKILLS
				.filter((s) => !args.category || s.category === args.category)
				.map(({ id, name, category, description }) => ({ id, name, category, description }));
			return { skills };
		}
	}));

	ctx.tools.register(defineTool({
		name: "skill_use",
		description: "Apply a skill to a task. Returns the skill's instructions to follow for the task.",
		parameters: {
			skill_id: { type: "string", required: true, description: "Skill id from skill_list." },
			task: { type: "string", required: true, description: "The task to perform with this skill." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					skill: { type: "string", required: true },
					instructions: { type: "string", required: true },
					task: { type: "string", required: true }
				}
			},
			render: (args, value) => `Skill "${value.skill}" applied to: ${value.task}\n\nInstructions:\n${value.instructions}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const skill = BUILTIN_SKILLS.find((s) => s.id === args.skill_id);
			if (!skill) throw new Error(`unknown skill id: ${args.skill_id} (use skill_list)`);
			const installed = loadInstalled();
			installed[skill.id] = { ...skill, usedAt: new Date().toISOString() };
			saveInstalled(installed);
			return { skill: skill.name, instructions: skill.instructions, task: args.task };
		}
	}));

	ctx.tools.register(defineTool({
		name: "skill_search",
		description: "Search the skill market for skills matching a query.",
		parameters: {
			query: { type: "string", required: true, description: "Search keywords." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					results: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string", required: true },
								name: { type: "string", required: true },
								description: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => value.results.map((s) => `${s.id} — ${s.description}`).join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const q = args.query.toLowerCase();
			const results = BUILTIN_SKILLS
				.filter((s) => s.id.includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.includes(q))
				.map(({ id, name, description }) => ({ id, name, description }));
			return { results };
		}
	}));
}
