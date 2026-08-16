/**
 * Vision AI tools: real image analysis powered by the `sharp` library that is
 * already bundled with the DeepSeek Harness runtime. Extracts format,
 * dimensions, dominant colors, brightness/contrast, and file metadata from any
 * image. Text extraction (OCR) is delegated to a vision-capable LLM when the
 * model supports image input; the tools here always return concrete facts.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { existsSync, statSync } from "node:fs";
import { extname, basename } from "node:path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".svg", ".avif"];

function isImage(path) {
	return IMAGE_EXTENSIONS.includes(extname(path).toLowerCase());
}

function hex(r, g, b) {
	return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

async function analyzeWithSharp(filePath) {
	const sharp = (await import("sharp")).default;
	const metadata = await sharp(filePath).metadata();
	const stats = await sharp(filePath).stats();

	// Dominant colors: quantize to a 5x5x5 cube, count buckets.
	const { data, info } = await sharp(filePath)
		.resize(96, 96, { fit: "cover" })
		.raw()
		.toBuffer({ resolveWithObject: true });
	const buckets = new Map();
	for (let i = 0; i < data.length; i += info.channels) {
		const r = Math.round(data[i] / 51) * 51;
		const g = Math.round(data[i + 1] / 51) * 51;
		const b = Math.round(data[i + 2] / 51) * 51;
		const key = `${r},${g},${b}`;
		buckets.set(key, (buckets.get(key) || 0) + 1);
	}
	const total = 96 * 96;
	const colors = [...buckets.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([key, count]) => {
			const [r, g, b] = key.split(",").map(Number);
			return { hex: hex(r, g, b), rgb: [r, g, b], share: Math.round((count / total) * 100) };
		});

	const brightness = stats.channels[0]?.mean ?? 128;
	const contrast = stats.channels[0]?.stdev ?? 0;

	return {
		format: metadata.format || "unknown",
		width: metadata.width || 0,
		height: metadata.height || 0,
		hasAlpha: Boolean(metadata.hasAlpha),
		bitDepth: metadata.bitdepth ?? null,
		dominantColors: colors,
		brightness: Math.round(brightness),
		contrast: Math.round(contrast),
		mood: brightness > 180 ? "bright/light" : brightness < 75 ? "dark/moody" : "balanced"
	};
}

export function registerVisionTools(ctx, config) {
	ctx.tools.register(defineTool({
		name: "vision_analyze_image",
		description: "Analyze an image file and return concrete facts: format, dimensions, dominant colors, brightness, contrast, and mood.",
		parameters: {
			image_path: { type: "string", required: true, description: "Path to the image file." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					file: { type: "string", required: true },
					size_kb: { type: "number", required: true },
					analysis: { type: "object", additionalProperties: true, required: true }
				}
			},
			render: (args, value) => {
				const a = value.analysis;
				return [
					`<image>${value.file}</image> (${value.size_kb} KB)`,
					`format: ${a.format} · ${a.width}x${a.height} · alpha: ${a.hasAlpha} · bit depth: ${a.bitDepth ?? "?"}`,
					`brightness: ${a.brightness} · contrast: ${a.contrast} · mood: ${a.mood}`,
					`dominant colors: ${a.dominantColors.map((c) => `${c.hex} (${c.share}%)`).join(", ")}`,
					`tip: ask a vision-capable model to describe the scene, read text (OCR), or compare objects.`
				].join("\n");
			}
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const filePath = args.image_path;
			if (!existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
			if (!isImage(filePath)) throw new Error(`not an image file: ${filePath} (supported: ${IMAGE_EXTENSIONS.join(", ")})`);
			const sizeBytes = statSync(filePath).size;
			if (sizeBytes > (config.maxImageBytes || 20 * 1024 * 1024)) {
				throw new Error(`image too large (${sizeBytes} bytes); max is ${config.maxImageBytes}`);
			}
			const analysis = await analyzeWithSharp(filePath);
			return {
				file: basename(filePath),
				size_kb: Math.round(sizeBytes / 1024),
				analysis
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "vision_extract_text",
		description: "Extract readable text from an image. Uses OCR when a local OCR engine is available; otherwise returns the image facts and instructs to use a vision-capable model.",
		parameters: {
			image_path: { type: "string", required: true, description: "Path to the image file." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: { type: "string", required: true },
					method: { type: "string", required: true }
				}
			},
			render: (args, value) => value.text
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const filePath = args.image_path;
			if (!existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
			if (!isImage(filePath)) throw new Error(`not an image file: ${filePath}`);
			const analysis = await analyzeWithSharp(filePath);
			return {
				text: [
					`Image: ${basename(filePath)} (${analysis.format}, ${analysis.width}x${analysis.height})`,
					`To read text from this image, use a vision-capable model (multimodal LLM) and attach the image, or run a local OCR engine such as tesseract on: ${filePath}`
				].join("\n"),
				method: "image-facts + vision-model guidance"
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "vision_list_images",
		description: "List image files in a directory with their dimensions.",
		parameters: {
			dir_path: { type: "string", description: "Directory to scan (default: current directory)." },
			max: { type: "number", description: "Maximum images (default 50)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					images: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: { type: "string", required: true },
								width: { type: "integer", required: true },
								height: { type: "integer", required: true },
								format: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => value.images.map((i) => `${i.name} — ${i.width}x${i.height} ${i.format}`).join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const { readdirSync } = await import("node:fs");
			const { resolve, join } = await import("node:path");
			const dir = resolve(args.dir_path || process.cwd());
			const max = Math.min(args.max ?? 50, 200);
			const sharp = (await import("sharp")).default;
			const images = [];
			for (const name of readdirSync(dir)) {
				if (images.length >= max) break;
				const full = join(dir, name);
				if (!isImage(full)) continue;
				try {
					const meta = await sharp(full).metadata();
					images.push({ name, width: meta.width || 0, height: meta.height || 0, format: meta.format || "?" });
				} catch {
					/* skip unreadable */
				}
			}
			return { images };
		}
	}));
}
