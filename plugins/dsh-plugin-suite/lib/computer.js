/**
 * Computer Use tools: desktop screenshot, open application, mouse/keyboard
 * primitives. Screenshot and app launch are implemented with real Windows
 * PowerShell/.NET calls; mouse/keyboard primitives are exposed for systems
 * where a native automation helper is available.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

function runPowershell(script) {
	return execFileAsync("powershell.exe", [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-Command", script
	], { timeout: 30000, windowsHide: true });
}

export function registerComputerTools(ctx) {
	ctx.tools.register(defineTool({
		name: "computer_screenshot",
		description: "Capture the Windows desktop (or primary screen) to a PNG file.",
		parameters: {
			path: {
				type: "string",
				description: "Output PNG path (default: %TEMP%/dsh-desktop.png)."
			}
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
			render: (args, value) => `desktop screenshot saved: ${value.path} (${value.bytes} bytes)`
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const outPath = args.path || join(tmpdir(), "dsh-desktop.png");
			const script = `
				Add-Type -AssemblyName System.Windows.Forms;
				Add-Type -AssemblyName System.Drawing;
				$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
				$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;
				$g = [System.Drawing.Graphics]::FromImage($bmp);
				$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);
				$bmp.Save("${outPath.replace(/\\/g, "\\\\")}", [System.Drawing.Imaging.ImageFormat]::Png);
				$g.Dispose(); $bmp.Dispose();
			`;
			await runPowershell(script);
			if (!existsSync(outPath)) throw new Error("screenshot failed: no file produced");
			const { statSync } = await import("node:fs");
			return { path: outPath, bytes: statSync(outPath).size };
		}
	}));

	ctx.tools.register(defineTool({
		name: "computer_open_app",
		description: "Open an application by name, executable path, or Start-menu name.",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "Application name or full path (e.g. notepad, calc, C:\\\\path\\\\app.exe)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					opened: { type: "boolean", required: true },
					detail: { type: "string", required: true }
				}
			},
			render: (args, value) => `open ${args.name}: ${value.detail}`
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const escaped = args.name.replace(/"/g, '\\"');
			const script = `Start-Process "${escaped}"`;
			try {
				await runPowershell(script);
				return { opened: true, detail: `launched ${args.name}` };
			} catch (err) {
				return { opened: false, detail: `failed to launch: ${err.message}` };
			}
		}
	}));

	ctx.tools.register(defineTool({
		name: "computer_open_url",
		description: "Open a URL in the default browser.",
		parameters: {
			url: { type: "string", required: true, description: "URL to open." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					opened: { type: "boolean", required: true },
					detail: { type: "string", required: true }
				}
			},
			render: (args, value) => `open url ${args.url}: ${value.detail}`
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const escaped = args.url.replace(/"/g, '\\"');
			await runPowershell(`Start-Process "${escaped}"`);
			return { opened: true, detail: `opened ${args.url} in default browser` };
		}
	}));

	ctx.tools.register(defineTool({
		name: "computer_get_windows",
		description: "List open top-level windows (titles) on the desktop.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					windows: {
						type: "array",
						required: true,
						items: { type: "string" }
					}
				}
			},
			render: (args, value) => renderList("Open windows:", value.windows)
		},
		isConcurrencySafe: () => true,
		async execute() {
			const script = `
				Get-Process | Where-Object { $_.MainWindowTitle -ne "" } |
				Select-Object -ExpandProperty MainWindowTitle -Unique |
				Select-Object -First 40
			`;
			const { stdout } = await runPowershell(script);
			const windows = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
			return { windows };
		}
	}));

	function renderList(title, items) {
		return title + "\n" + items.map((i, n) => `${n + 1}. ${i}`).join("\n");
	}
}
