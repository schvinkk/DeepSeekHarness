/**
 * Document generation tools: PRD, proposal, meeting notes, weekly report.
 * Each tool generates a complete markdown document and saves it to the
 * workspace so the model can then edit or deliver it.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

function saveDoc(content, filename) {
	const outPath = resolve(process.cwd(), filename);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, content, "utf-8");
	return outPath;
}

function bulletList(items) {
	return (items || []).map((i) => `- ${i}`).join("\n") || "- (none)";
}

function renderDoc(args, value) {
	return `Document saved to <path>${value.path}</path>\n\n${value.preview}`;
}

export function registerDocumentTools(ctx) {
	ctx.tools.register(defineTool({
		name: "document_generate_prd",
		description: "Generate a complete Product Requirements Document (PRD) in markdown and save it.",
		parameters: {
			title: { type: "string", required: true, description: "Product / feature name." },
			problem: { type: "string", description: "Problem statement." },
			solution: { type: "string", description: "Proposed solution." },
			target_users: { type: "string", description: "Target users description." },
			features: { type: "array", items: { type: "string" }, description: "Key features." },
			success_metrics: { type: "string", description: "How success is measured." },
			output: { type: "string", description: "Output filename (default: PRD.md)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					preview: { type: "string", required: true }
				}
			},
			render: renderDoc
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const doc = [
				`# ${args.title} — 产品需求文档 (PRD)`,
				"",
				"## 1. 概述",
				`本文档定义 **${args.title}** 的产品需求。`,
				"",
				"## 2. 问题背景",
				args.problem || "（待补充问题背景）",
				"",
				"## 3. 解决方案",
				args.solution || "（待补充解决方案）",
				"",
				"## 4. 目标用户",
				args.target_users || "（待补充目标用户）",
				"",
				"## 5. 功能需求",
				bulletList(args.features),
				"",
				"## 6. 成功指标",
				args.success_metrics || "（待补充成功指标）",
				"",
				"## 7. 里程碑",
				"- M1: 需求确认",
				"- M2: 设计与开发",
				"- M3: 测试与上线",
				"",
				`> 由 DeepSeek Harness v2.95.27 插件套件生成 · ${new Date().toISOString()}`
			].join("\n");
			const path = saveDoc(doc, args.output || "PRD.md");
			return { path, preview: doc.slice(0, 2000) };
		}
	}));

	ctx.tools.register(defineTool({
		name: "document_generate_proposal",
		description: "Generate a project proposal document in markdown and save it.",
		parameters: {
			title: { type: "string", required: true },
			background: { type: "string", description: "Background / context." },
			objectives: { type: "string", description: "Project objectives." },
			approach: { type: "string", description: "Proposed approach." },
			budget: { type: "string", description: "Budget estimate." },
			timeline: { type: "string", description: "Timeline." },
			output: { type: "string", description: "Output filename (default: Proposal.md)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					preview: { type: "string", required: true }
				}
			},
			render: renderDoc
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const doc = [
				`# ${args.title} — 项目提案`,
				"",
				"## 背景",
				args.background || "（待补充）",
				"",
				"## 目标",
				args.objectives || "（待补充）",
				"",
				"## 方案",
				args.approach || "（待补充）",
				"",
				"## 预算",
				args.budget || "（待补充）",
				"",
				"## 时间线",
				args.timeline || "（待补充）",
				"",
				`> 由 DeepSeek Harness v2.95.27 插件套件生成 · ${new Date().toISOString()}`
			].join("\n");
			const path = saveDoc(doc, args.output || "Proposal.md");
			return { path, preview: doc.slice(0, 2000) };
		}
	}));

	ctx.tools.register(defineTool({
		name: "document_generate_meeting_notes",
		description: "Generate meeting notes in markdown and save them.",
		parameters: {
			title: { type: "string", required: true, description: "Meeting title." },
			date: { type: "string", description: "Meeting date (default: today)." },
			attendees: { type: "array", items: { type: "string" }, description: "Attendees." },
			agenda: { type: "string", description: "Agenda items." },
			discussion: { type: "string", description: "Discussion summary." },
			decisions: { type: "array", items: { type: "string" }, description: "Decisions made." },
			action_items: { type: "array", items: { type: "string" }, description: "Action items." },
			output: { type: "string", description: "Output filename (default: MeetingNotes.md)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					preview: { type: "string", required: true }
				}
			},
			render: renderDoc
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const today = new Date().toISOString().split("T")[0];
			const doc = [
				`# ${args.title} — 会议纪要`,
				"",
				`**日期：** ${args.date || today}`,
				`**参会人：** ${(args.attendees || []).join("、") || "（待补充）"}`,
				"",
				"## 议程",
				args.agenda || "（待补充）",
				"",
				"## 讨论",
				args.discussion || "（待补充）",
				"",
				"## 决议",
				bulletList(args.decisions),
				"",
				"## 行动项",
				bulletList(args.action_items),
				"",
				`> 由 DeepSeek Harness v2.95.27 插件套件生成 · ${new Date().toISOString()}`
			].join("\n");
			const path = saveDoc(doc, args.output || "MeetingNotes.md");
			return { path, preview: doc.slice(0, 2000) };
		}
	}));

	ctx.tools.register(defineTool({
		name: "document_generate_report",
		description: "Generate a weekly or monthly report in markdown and save it.",
		parameters: {
			title: { type: "string", required: true, description: "Report title." },
			period: { type: "string", description: "Report period, e.g. '2025-W33'." },
			accomplishments: { type: "array", items: { type: "string" }, description: "What was accomplished." },
			metrics: { type: "string", description: "Key metrics." },
			challenges: { type: "array", items: { type: "string" }, description: "Challenges / blockers." },
			next_plan: { type: "array", items: { type: "string" }, description: "Next period plan." },
			output: { type: "string", description: "Output filename (default: Report.md)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					preview: { type: "string", required: true }
				}
			},
			render: renderDoc
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const doc = [
				`# ${args.title}`,
				"",
				`**周期：** ${args.period || new Date().toISOString().split("T")[0]}`,
				"",
				"## 完成事项",
				bulletList(args.accomplishments),
				"",
				"## 关键指标",
				args.metrics || "（待补充）",
				"",
				"## 问题与风险",
				bulletList(args.challenges),
				"",
				"## 下期计划",
				bulletList(args.next_plan),
				"",
				`> 由 DeepSeek Harness v2.95.27 插件套件生成 · ${new Date().toISOString()}`
			].join("\n");
			const path = saveDoc(doc, args.output || "Report.md");
			return { path, preview: doc.slice(0, 2000) };
		}
	}));
}
