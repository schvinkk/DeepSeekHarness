/**
 * Video tools: slideshow generation via ffmpeg when available, Remotion
 * project scaffolding, and render-command generation. ffmpeg is detected on
 * PATH; when absent the tools return exact commands the user can run.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function hasFfmpeg() {
	try {
		await execFileAsync("ffmpeg", ["-version"], { timeout: 5000, windowsHide: true });
		return true;
	} catch {
		return false;
	}
}

export function registerVideoTools(ctx) {
	ctx.tools.register(defineTool({
		name: "video_create_slideshow",
		description: "Create a video slideshow from a set of images using ffmpeg (if installed), or return the exact command to run.",
		parameters: {
			images: {
				type: "array",
				required: true,
				items: { type: "string" },
				description: "List of image file paths (will be sorted)."
			},
			output: { type: "string", description: "Output video path (default: slideshow.mp4)." },
			duration_per_image: { type: "number", description: "Seconds per image (default 3)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					output: { type: "string", required: true },
					rendered: { type: "boolean", required: true },
					command: { type: "string", required: true },
					detail: { type: "string", required: true }
				}
			},
			render: (args, value) => value.rendered
				? `rendered slideshow -> ${value.output}\n${value.detail}`
				: `ffmpeg not found. Run manually:\n${value.command}`
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const images = [...args.images].sort();
			const outPath = resolve(process.cwd(), args.output || "slideshow.mp4");
			const dur = Math.max(1, args.duration_per_image || 3);

			if (images.length === 0) throw new Error("no images provided");
			const missing = images.filter((i) => !existsSync(i));
			if (missing.length > 0) throw new Error(`image(s) not found: ${missing.join(", ")}`);

			const inputs = images.map((i) => `-loop 1 -t ${dur} -i "${i}"`).join(" ");
			const filter = images.map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`).join("; ");
			const concat = images.map((_, i) => `[v${i}]`).join("");
			const command = `ffmpeg -y ${inputs} -filter_complex "${filter}; ${concat}concat=n=${images.length}:v=1:a=0[outv]" -map "[outv]" -c:v libx264 -pix_fmt yuv420p "${outPath}"`;

			if (await hasFfmpeg()) {
				try {
					mkdirSync(dirname(outPath), { recursive: true });
					await execFileAsync(command, [], { shell: true, timeout: 300000, windowsHide: true });
					return { output: outPath, rendered: true, command, detail: `${images.length} images, ${dur}s each -> ${outPath}` };
				} catch (err) {
					return { output: outPath, rendered: false, command, detail: `ffmpeg failed: ${err.message}` };
				}
			}
			return { output: outPath, rendered: false, command, detail: "ffmpeg not found on PATH" };
		}
	}));

	ctx.tools.register(defineTool({
		name: "video_scaffold_remotion",
		description: "Scaffold a Remotion project (programmatic video) with a starter composition and a render command.",
		parameters: {
			project_dir: { type: "string", required: true, description: "Directory to create the project in." },
			title: { type: "string", description: "Video title text (default: DeepSeek Harness)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					dir: { type: "string", required: true },
					files: { type: "array", required: true, items: { type: "string" } },
					render_command: { type: "string", required: true }
				}
			},
			render: (args, value) => [
				`Remotion project scaffolded at ${value.dir}`,
				`files: ${value.files.join(", ")}`,
				`render: ${value.render_command}`
			].join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const dir = resolve(args.project_dir);
			const title = args.title || "DeepSeek Harness";
			mkdirSync(dir, { recursive: true });

			writeFileSync(join(dir, "package.json"), JSON.stringify({
				name: "dsh-remotion-project",
				version: "1.0.0",
				scripts: { render: "remotion render src/index.tsx out/video.mp4" },
				dependencies: { remotion: "^4.0.0", "@remotion/cli": "^4.0.0", react: "^18.3.1", "react-dom": "^18.3.1" }
			}, null, 2));

			writeFileSync(join(dir, "src", "index.tsx"), `
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Composition, registerRoot } from "remotion";

const MyComp = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, durationInFrames], [0.8, 1.2]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0f0f23", justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ color: "#fff", fontSize: 80, opacity, transform: \`scale(\${scale})\` }}>${title}</h1>
      <p style={{ color: "#4cc9f0", fontSize: 28 }}>Generated by DeepSeek Harness</p>
    </AbsoluteFill>
  );
};

export const RemotionRoot = () => (
  <Composition id="Main" component={MyComp} durationInFrames={150} fps={30} width={1920} height={1080} />
);
registerRoot(RemotionRoot);
`.trim() + "\n");

			return {
				dir,
				files: ["package.json", "src/index.tsx"],
				render_command: `cd "${dir}" && npm install && npx remotion render src/index.tsx out/video.mp4`
			};
		}
	}));
}
