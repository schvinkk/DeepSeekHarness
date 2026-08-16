/**
 * Spreadsheet / data-analysis tools: parse CSV (or any delimited text),
 * compute statistics, detect outliers and correlations, and export an
 * analyzed report. Pure Node.js implementation — no external deps.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseDelimited(text, delimiter = ",") {
	const rows = [];
	let row = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; }
				else inQuotes = false;
			} else field += c;
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === delimiter) {
			row.push(field); field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field); field = "";
			if (row.some((f) => f !== "")) rows.push(row);
			row = [];
		} else {
			field += c;
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		if (row.some((f) => f !== "")) rows.push(row);
	}
	return rows;
}

function toNumber(v) {
	if (typeof v === "number") return v;
	const n = Number(String(v).replace(/,/g, "").trim());
	return Number.isFinite(n) ? n : null;
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function median(arr) {
	const s = [...arr].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdev(arr) {
	if (arr.length < 2) return 0;
	const m = mean(arr);
	return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
function corr(a, b) {
	if (a.length < 2 || a.length !== b.length) return 0;
	const ma = mean(a), mb = mean(b);
	let num = 0, da = 0, db = 0;
	for (let i = 0; i < a.length; i++) {
		num += (a[i] - ma) * (b[i] - mb);
		da += (a[i] - ma) ** 2;
		db += (b[i] - mb) ** 2;
	}
	const den = Math.sqrt(da * db);
	return den === 0 ? 0 : num / den;
}

function fmt(n) {
	return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

export function registerSpreadsheetTools(ctx) {
	ctx.tools.register(defineTool({
		name: "spreadsheet_analyze",
		description: "Analyze a CSV/delimited file: column stats, outliers, correlations, and a summary report.",
		parameters: {
			file_path: { type: "string", required: true, description: "Path to the CSV file." },
			delimiter: { type: "string", description: "Field delimiter (default: ,)." },
			has_header: { type: "boolean", description: "Whether the first row is a header (default true)." },
			output: { type: "string", description: "Optional report output filename." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					rows: { type: "integer", required: true },
					columns: { type: "array", required: true, items: { type: "string" } },
					stats: { type: "object", additionalProperties: true, required: true },
					insights: { type: "array", required: true, items: { type: "string" } },
					report: { type: "string", required: true }
				}
			},
			render: (args, value) => value.report
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const text = readFileSync(args.file_path, "utf-8");
			const rows = parseDelimited(text, args.delimiter || ",");
			if (rows.length === 0) throw new Error("file is empty");
			const hasHeader = args.has_header !== false;
			const header = hasHeader ? rows[0] : rows[0].map((_, i) => `col${i + 1}`);
			const data = (hasHeader ? rows.slice(1) : rows).slice(0, 10000);
			const numeric = header.map((name, i) => data.map((r) => toNumber(r[i])).filter((v) => v !== null));

			const stats = {};
			numeric.forEach((col, i) => {
				if (col.length > 0) {
					stats[header[i]] = {
						count: col.length,
						mean: fmt(mean(col)),
						median: fmt(median(col)),
						min: fmt(Math.min(...col)),
						max: fmt(Math.max(...col)),
						stdev: fmt(stdev(col))
					};
				}
			});

			const insights = [];
			numeric.forEach((col, i) => {
				if (col.length >= 3) {
					const m = mean(col), sd = stdev(col);
					const outliers = col.filter((v) => Math.abs(v - m) > 2 * sd);
					if (outliers.length > 0) {
						insights.push(`"${header[i]}": ${outliers.length} possible outliers (beyond 2σ, e.g. ${fmt(outliers[0])})`);
					}
				}
			});
			for (let i = 0; i < header.length; i++) {
				for (let j = i + 1; j < header.length; j++) {
					const c = corr(numeric[i], numeric[j]);
					if (Math.abs(c) > 0.7 && numeric[i].length >= 3) {
						insights.push(`"${header[i]}" ↔ "${header[j]}": strong ${c > 0 ? "positive" : "negative"} correlation (${fmt(c)})`);
					}
				}
			}

			const report = [
				`# Data Analysis Report`,
				``,
				`Source: ${args.file_path}`,
				`Rows: ${data.length}, Columns: ${header.length}`,
				``,
				`## Column Statistics`,
				``,
				`| Column | Count | Mean | Median | Min | Max | StdDev |`,
				`|---|---|---|---|---|---|---|`
			].concat(
				Object.entries(stats).map(([name, s]) => `| ${name} | ${s.count} | ${s.mean} | ${s.median} | ${s.min} | ${s.max} | ${s.stdev} |`)
			).concat([
				``,
				`## Insights`,
				``
			]).concat(insights.length ? insights.map((i) => `- ${i}`) : ["- No significant outliers or strong correlations detected."]);

			const reportText = report.join("\n");
			if (args.output) writeFileSync(resolve(process.cwd(), args.output), reportText, "utf-8");
			return {
				rows: data.length,
				columns: header,
				stats,
				insights,
				report: reportText
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "spreadsheet_to_csv",
		description: "Convert any delimited text file to a normalized CSV.",
		parameters: {
			file_path: { type: "string", required: true },
			delimiter: { type: "string", description: "Input delimiter (default: tab)." },
			output: { type: "string", required: true, description: "Output CSV filename." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					rows: { type: "integer", required: true }
				}
			},
			render: (args, value) => `converted ${value.rows} rows -> ${value.path}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const text = readFileSync(args.file_path, "utf-8");
			const rows = parseDelimited(text, args.delimiter || "\t");
			const csv = rows
				.map((r) => r.map((f) => /[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f).join(","))
				.join("\n");
			const outPath = resolve(process.cwd(), args.output);
			writeFileSync(outPath, csv, "utf-8");
			return { path: outPath, rows: rows.length };
		}
	}));
}
