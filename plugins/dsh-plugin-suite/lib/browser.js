/**
 * Browser control tools: navigate, search, click, type, screenshot.
 * Uses a real headless Chrome via the Chrome DevTools Protocol when Chrome is
 * available; otherwise falls back to direct HTTP fetching for navigate/search.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CDP_PORT = 9222;

/** Locate a Chrome/Edge executable on Windows. */
function findBrowserPath() {
	const candidates = [
		process.env.CHROME_PATH,
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
		`${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`
	];
	return candidates.find((c) => c && existsSync(c)) || null;
}

let chromeProcess = null;
let ws = null;

/** Start headless Chrome with remote debugging and connect a CDP socket. */
async function ensureCdp() {
	if (ws && ws.readyState === WebSocket.OPEN) return ws;
	const browserPath = findBrowserPath();
	if (!browserPath) throw new Error("Chrome/Edge not found — install Chrome or set CHROME_PATH");

	const userDataDir = join(tmpdir(), `dsh-chrome-${process.pid}`);
	chromeProcess = spawn(browserPath, [
		"--headless=new",
		"--disable-gpu",
		"--no-sandbox",
		"--remote-debugging-port=" + CDP_PORT,
		"--user-data-dir=" + userDataDir,
		"about:blank"
	], { stdio: "ignore", detached: true });

	// Wait for the DevTools endpoint.
	let target = null;
	for (let i = 0; i < 50; i++) {
		await new Promise((r) => setTimeout(r, 200));
		try {
			const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
			const list = await res.json();
			target = list.find((t) => t.type === "page");
			if (target) break;
		} catch {
			/* not ready yet */
		}
	}
	if (!target) throw new Error("Chrome DevTools endpoint did not come up");

	ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.onopen = resolve;
		ws.onerror = reject;
	});
	return ws;
}

let cdpId = 0;
const pending = new Map();

function cdpCall(method, params = {}) {
	return new Promise((resolve, reject) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			reject(new Error("CDP socket not open"));
			return;
		}
		const id = ++cdpId;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
}

async function setupCdpHandlers() {
	if (ws._handlers) return;
	ws._handlers = true;
	ws.onmessage = (ev) => {
		let msg;
		try {
			msg = JSON.parse(ev.data);
		} catch {
			return;
		}
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			if (msg.error) reject(new Error(msg.error.message));
			else resolve(msg.result);
		}
	};
}

async function cdpSend(method, params = {}) {
	await ensureCdp();
	await setupCdpHandlers();
	return await cdpCall(method, params);
}

async function evaluate(expression) {
	const res = await cdpSend("Runtime.evaluate", {
		expression,
		returnByValue: true
	});
	if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || "evaluation failed");
	return res.result?.value;
}

function outputRender(args, text) {
	return [{ type: "text", text }];
}

export function registerBrowserTools(ctx) {
	ctx.tools.register(defineTool({
		name: "browser_navigate",
		description: "Navigate the browser to a URL and return the page title and text content.",
		parameters: {
			url: {
				type: "string",
				required: true,
				description: "Full URL (http/https) to open."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					url: { type: "string", required: true },
					title: { type: "string", required: true },
					text: { type: "string", required: true }
				}
			},
			render: (args, value) => outputRender(args, `<url>${value.url}</url>\n<title>${value.title}</title>\n\n${value.text}`)
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const url = args.url;
			if (/^https?:\/\//i.test(url)) {
				await cdpSend("Page.enable");
				await cdpSend("Page.navigate", { url });
				await new Promise((r) => setTimeout(r, 2500));
				const title = (await evaluate("document.title")) || "";
				const text = (await evaluate("document.body ? document.body.innerText.slice(0, 12000) : ''")) || "";
				return { url, title: String(title), text: String(text) };
			}
			// Fallback: plain HTTP fetch (works headless without Chrome).
			const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
			const html = await res.text();
			const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
			const text = html
				.replace(/<script[\s\S]*?<\/script>/gi, "")
				.replace(/<style[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 12000);
			return { url, title: title.trim(), text };
		}
	}));

	ctx.tools.register(defineTool({
		name: "browser_search",
		description: "Search the web for a query and return the top result titles and URLs.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "Search query."
			},
			max_results: {
				type: "number",
				description: "Maximum results to return (default 5, max 10)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					query: { type: "string", required: true },
					results: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								title: { type: "string", required: true },
								url: { type: "string", required: true }
							}
						}
					},
					error: { type: "string" }
				}
			},
			render: (args, value) => value.error
				? `Search failed: ${value.error}`
				: `Search results for "${value.query}":\n` + value.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const limit = Math.min(args.max_results ?? 5, 10);
			const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(args.query);
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 15000);
			let res;
			try {
				res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: controller.signal });
			} catch (err) {
				clearTimeout(timer);
				return {
					query: args.query,
					results: [],
					error: `search engine unreachable (${err.message}); try browser_navigate on a known URL instead`
				};
			} finally {
				clearTimeout(timer);
			}
			const html = await res.text();
			const results = [];
			const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
			let m;
			while ((m = re.exec(html)) && results.length < limit) {
				results.push({
					title: m[2].replace(/<[^>]+>/g, "").trim(),
					url: m[1]
				});
			}
			return { query: args.query, results };
		}
	}));

	ctx.tools.register(defineTool({
		name: "browser_click",
		description: "Click an element on the current browser page by CSS selector.",
		parameters: {
			selector: {
				type: "string",
				required: true,
				description: "CSS selector of the element to click."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					clicked: { type: "boolean", required: true },
					selector: { type: "string", required: true },
					detail: { type: "string", required: true }
				}
			},
			render: (args, value) => outputRender(args, `clicked ${value.selector}: ${value.detail}`)
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const detail = await evaluate(`(() => {
				const el = document.querySelector(${JSON.stringify(args.selector)});
				if (!el) return "element not found";
				el.scrollIntoView({block:"center"});
				el.click();
				return "clicked " + el.tagName.toLowerCase();
			})()`);
			return { clicked: !String(detail).includes("not found"), selector: args.selector, detail: String(detail) };
		}
	}));

	ctx.tools.register(defineTool({
		name: "browser_type",
		description: "Type text into an input element on the current browser page by CSS selector.",
		parameters: {
			selector: {
				type: "string",
				required: true,
				description: "CSS selector of the input."
			},
			text: {
				type: "string",
				required: true,
				description: "Text to type."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					typed: { type: "boolean", required: true },
					selector: { type: "string", required: true },
					length: { type: "integer", required: true }
				}
			},
			render: (args, value) => outputRender(args, `typed ${value.length} chars into ${value.selector}`)
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const result = await evaluate(`(() => {
				const el = document.querySelector(${JSON.stringify(args.selector)});
				if (!el) return "not found";
				el.focus();
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
				setter.call(el, ${JSON.stringify(args.text)});
				el.dispatchEvent(new Event("input", {bubbles:true}));
				el.dispatchEvent(new Event("change", {bubbles:true}));
				return "ok";
			})()`);
			return {
				typed: String(result) !== "not found",
				selector: args.selector,
				length: args.text.length
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "browser_screenshot",
		description: "Take a screenshot of the current browser page and save it to a PNG file.",
		parameters: {
			path: {
				type: "string",
				description: "Output PNG path (default: %TEMP%/dsh-browser.png)."
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
			render: (args, value) => outputRender(args, `screenshot saved: ${value.path} (${value.bytes} bytes)`)
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			await cdpSend("Page.enable");
			const shot = await cdpSend("Page.captureScreenshot", { format: "png" });
			const outPath = args.path || join(tmpdir(), "dsh-browser.png");
			const { writeFileSync } = await import("node:fs");
			writeFileSync(outPath, Buffer.from(shot.data, "base64"));
			return { path: outPath, bytes: shot.data.length };
		}
	}));
}
