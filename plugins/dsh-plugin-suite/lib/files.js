/**
 * File tools: upload (copy into a managed upload dir + inspect), read text or
 * binary files, list directories, and report file details. Pure Node.js.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	copyFileSync,
	writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename, extname } from "node:path";

function expandDir(dir) {
	return String(dir)
		.replace(/%TEMP%/g, tmpdir())
		.replace(/%HOME%/g, process.env.USERPROFILE || process.env.HOME || tmpdir());
}

function detectType(name) {
	const ext = extname(name).toLowerCase();
	if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".svg", ".avif"].includes(ext)) return "image";
	if ([".pdf"].includes(ext)) return "pdf";
	if ([".doc", ".docx", ".odt", ".rtf"].includes(ext)) return "document";
	if ([".xls", ".xlsx", ".csv", ".tsv", ".ods"].includes(ext)) return "spreadsheet";
	if ([".ppt", ".pptx", ".odp"].includes(ext)) return "presentation";
	if ([".mp4", ".webm", ".avi", ".mov", ".mkv"].includes(ext)) return "video";
	if ([".mp3", ".wav", ".ogg", ".flac", ".m4a"].includes(ext)) return "audio";
	if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) return "archive";
	if ([".js", ".ts", ".py", ".java", ".cpp", ".c", ".h", ".go", ".rs", ".rb", ".php"].includes(ext)) return "code";
	if ([".md", ".txt", ".json", ".xml", ".yaml", ".yml", ".html", ".css"].includes(ext)) return "text";
	return "other";
}

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".xml", ".yaml", ".yml", ".html", ".css", ".js", ".ts", ".py", ".java", ".c", ".cpp", ".h", ".go", ".rs", ".rb", ".php", ".csv", ".tsv", ".log", ".ini", ".cfg", ".toml", ".sh", ".ps1", ".bat", ".sql"]);

export function registerFileTools(ctx, config) {
	const uploadDir = expandDir(config.uploadDir || "%TEMP%/dsh-uploads");
	mkdirSync(uploadDir, { recursive: true });

	ctx.tools.register(defineTool({
		name: "file_upload",
		description: "Upload (register) a file into the managed upload directory and return its details. Use for any file: images, documents, archives, code.",
		parameters: {
			file_path: { type: "string", required: true, description: "Path of the file to upload." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: { type: "string", required: true },
					path: { type: "string", required: true },
					size_kb: { type: "number", required: true },
					type: { type: "string", required: true },
					extension: { type: "string", required: true }
				}
			},
			render: (args, value) => `uploaded ${value.name} (${value.type}, ${value.size_kb} KB) -> ${value.path}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const src = args.file_path;
			if (!existsSync(src)) throw new Error(`file not found: ${src}`);
			const stats = statSync(src);
			const dest = join(uploadDir, `${Date.now()}_${basename(src)}`);
			copyFileSync(src, dest);
			return {
				name: basename(src),
				path: dest,
				size_kb: Math.round(stats.size / 1024),
				type: detectType(src),
				extension: extname(src).toLowerCase()
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "file_read",
		description: "Read a file. Text files return their content; binary files return a summary (type, size, base64 preview).",
		parameters: {
			file_path: { type: "string", required: true, description: "Path to the file." },
			max_chars: { type: "number", description: "Maximum characters for text files (default 20000)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					binary: { type: "boolean", required: true },
					content: { type: "string", required: true },
					truncated: { type: "boolean", required: true }
				}
			},
			render: (args, value) => `<path>${value.path}</path>\n${value.content}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const filePath = args.file_path;
			if (!existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
			const stats = statSync(filePath);
			if (stats.isDirectory()) throw new Error(`${filePath} is a directory; use file_list`);
			const ext = extname(filePath).toLowerCase();
			const max = Math.min(args.max_chars ?? 20000, 100000);

			if (TEXT_EXTENSIONS.has(ext) || stats.size < 1024 * 1024) {
				let content = readFileSync(filePath, "utf-8");
				const truncated = content.length > max;
				if (truncated) content = content.slice(0, max) + "\n... (truncated)";
				return { path: filePath, binary: false, content, truncated };
			}
			const buf = readFileSync(filePath);
			return {
				path: filePath,
				binary: true,
				content: `binary file (${detectType(filePath)}, ${stats.size} bytes). base64 preview: ${buf.subarray(0, 200).toString("base64")}...`,
				truncated: false
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "file_list",
		description: "List files and directories under a path with sizes and types.",
		parameters: {
			dir_path: { type: "string", description: "Directory to list (default: current)." },
			max: { type: "number", description: "Maximum entries (default 100)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					entries: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: { type: "string", required: true },
								type: { type: "string", required: true },
								size: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => value.entries.map((e) => `${e.type === "dir" ? "[D]" : "[F]"} ${e.name}  ${e.size}`).join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const dir = resolve(args.dir_path || process.cwd());
			if (!existsSync(dir)) throw new Error(`directory not found: ${dir}`);
			const max = Math.min(args.max ?? 100, 500);
			const entries = readdirSync(dir).slice(0, max).map((name) => {
				const full = join(dir, name);
				let type = "file";
				let size = "-";
				try {
					const s = statSync(full);
					if (s.isDirectory()) type = "dir";
					else size = s.size < 1024 ? `${s.size} B` : `${(s.size / 1024).toFixed(1)} KB`;
				} catch {
					/* unreadable */
				}
				return { name, type, size };
			});
			return { path: dir, entries };
		}
	}));

	ctx.tools.register(defineTool({
		name: "file_write",
		description: "Write text content to a file (creates parent directories).",
		parameters: {
			file_path: { type: "string", required: true, description: "Target file path." },
			content: { type: "string", required: true, description: "Text content to write." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					bytes: { type: "integer", required: true }
				}
			},
			render: (args, value) => `wrote ${value.bytes} bytes -> ${value.path}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const outPath = resolve(args.file_path);
			mkdirSync(join(outPath, ".."), { recursive: true });
			const buf = Buffer.from(args.content, "utf-8");
			writeFileSync(outPath, buf);
			return { path: outPath, bytes: buf.length };
		}
	}));
}
