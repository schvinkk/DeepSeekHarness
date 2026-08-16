/**
 * Functional test for the DSH Plugin Suite: mocks the Cordis context
 * (`ctx.tools.register`, `ctx.systemPrompt.section`), calls apply(), and
 * executes every tool with realistic inputs. Run with the bundled Node:
 *   packaging\app\runtime\node.exe test\run-tests.mjs
 */

import { apply, name, inject, Config } from "../lib/index.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let pass = 0, fail = 0;
const failures = [];

const registered = [];
const sections = [];

const ctx = {
	tools: {
		register(def) {
			registered.push(def);
		}
	},
	systemPrompt: {
		section(s) {
			sections.push(s);
		}
	}
};

function check(cond, label, detail) {
	if (cond) { pass++; console.log(`  ✅ ${label}`); }
	else { fail++; failures.push(label); console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`); }
}

// ---------------------------------------------------------------- apply
console.log("Plugin contract:");
check(name === "plugin-suite", `name = "plugin-suite" (got "${name}")`);
check(Array.isArray(inject) && inject.includes("tools") && inject.includes("systemPrompt"), `inject has tools+systemPrompt (got ${JSON.stringify(inject)})`);
check(Config !== undefined && (typeof Config === "object" || typeof Config === "function"), `Config schema present (typeof=${typeof Config})`);
check(typeof apply === "function", "apply is a function");

apply(ctx, {
	uploadDir: "%TEMP%/dsh-plugin-test-uploads",
	maxImageBytes: 20 * 1024 * 1024,
	contextThreshold: 0.85
});

check(registered.length >= 30, `registered ${registered.length} tools (expected ≥30)`);
check(sections.length >= 1, `system prompt sections: ${sections.length}`);

const byName = Object.fromEntries(registered.map((t) => [t.name, t]));

// ---------------------------------------------------------------- helper
function schemaOf(def) {
	const p = def.parameters || {};
	const out = {};
	for (const [k, v] of Object.entries(p)) out[k] = v;
	return out;
}

async function runTool(name_, args) {
	const def = byName[name_];
	if (!def) throw new Error(`tool not registered: ${name_}`);
	return await def.execute(args, {});
}

const work = join(tmpdir(), "dsh-plugin-test");
mkdirSync(work, { recursive: true });
process.chdir(work);

// ---------------------------------------------------------------- browser
console.log("\nBrowser tools:");
check(Boolean(byName.browser_search), "browser_search registered");
let searchRes;
try {
	searchRes = await runTool("browser_search", { query: "deepseek harness", max_results: 3 });
	check(Array.isArray(searchRes.results), "browser_search executes (network)", JSON.stringify(searchRes.results || searchRes).slice(0, 120));
} catch (err) {
	check(false, "browser_search executes (network)", err.message.slice(0, 120));
}

// ---------------------------------------------------------------- documents
console.log("\nDocument tools:");
const prd = await runTool("document_generate_prd", {
	title: "Test Product", problem: "No test product", solution: "Build one",
	features: ["A", "B"], output: "test-prd.md"
});
check(existsSync(prd.path), `PRD written to ${prd.path}`);
check(prd.preview.includes("# Test Product"), "PRD content correct");

const notes = await runTool("document_generate_meeting_notes", { title: "Sync", attendees: ["A"], action_items: ["x"] });
check(notes.preview.includes("Sync"), "Meeting notes generated");

// ---------------------------------------------------------------- webapp
console.log("\nWeb app tools:");
const app = await runTool("webapp_generate", { name: "My SaaS", type: "saas", description: "A test SaaS", output: "test-app.html" });
check(existsSync(app.path), `web app written (${app.bytes} bytes)`);
const appHtml = await import("node:fs").then((f) => f.readFileSync(app.path, "utf-8"));
check(appHtml.includes("My SaaS") && appHtml.includes("<html"), "web app HTML content correct");

// ---------------------------------------------------------------- spreadsheets
console.log("\nSpreadsheet tools:");
const csvPath = join(work, "data.csv");
writeFileSync(csvPath, "name,age,score\nA,20,90\nB,30,80\nC,40,70\nD,50,60\n");
const analysis = await runTool("spreadsheet_analyze", { file_path: csvPath });
check(analysis.rows === 4, `analyzed ${analysis.rows} rows`);
check(typeof analysis.stats.age === "object", "column stats computed");
check(analysis.stats.age.mean === "35", `mean age = ${analysis.stats.age.mean}`);
check(analysis.insights.length >= 0, "insights computed");

// ---------------------------------------------------------------- files
console.log("\nFile tools:");
const uploaded = await runTool("file_upload", { file_path: csvPath });
check(uploaded.type === "spreadsheet", `uploaded type=${uploaded.type}`);
const readBack = await runTool("file_read", { file_path: csvPath });
check(readBack.content.includes("name,age,score"), "file_read returns content");
const listed = await runTool("file_list", { dir_path: work });
check(listed.entries.some((e) => e.name === "data.csv"), "file_list sees file");

// ---------------------------------------------------------------- vision
console.log("\nVision tools:");
const imgPath = join(work, "test.png");
// Create a real PNG with a solid red + blue split using sharp.
const sharp = (await import("sharp")).default;
const svg = `<svg width="200" height="100"><rect width="100" height="100" fill="red"/><rect x="100" width="100" height="100" fill="blue"/></svg>`;
await sharp(Buffer.from(svg)).png().toFile(imgPath);
check(existsSync(imgPath), "test image created");
const vision = await runTool("vision_analyze_image", { image_path: imgPath });
check(vision.analysis.format === "png", `format=${vision.analysis.format}`);
check(vision.analysis.width === 200 && vision.analysis.height === 100, `dims=${vision.analysis.width}x${vision.analysis.height}`);
check(vision.analysis.dominantColors.length >= 2, `dominant colors: ${vision.analysis.dominantColors.map((c) => c.hex).join(",")}`);
const visionList = await runTool("vision_list_images", { dir_path: work });
check(visionList.images.some((i) => i.name === "test.png"), "vision_list_images finds image");

// ---------------------------------------------------------------- context
console.log("\nContext tools:");
const ctxRes = await runTool("context_compress", {
	messages: [
		{ role: "user", content: "Please build a landing page for my startup called FooBar" },
		{ role: "assistant", content: "I created index.html with hero, features, and pricing sections" },
		{ role: "user", content: "Also add a contact form and remember we deploy to Vercel" }
	]
});
check(ctxRes.summary.includes("FooBar"), "context summary preserves key content");
// Long input should compress; short input still yields a structural summary.
const longMsgs = Array.from({ length: 20 }, (_, i) => ({
	role: i % 2 === 0 ? "user" : "assistant",
	content: `Message ${i}: discussing feature X implementation details and file changes for the FooBar project. `.repeat(8)
}));
const longRes = await runTool("context_compress", { messages: longMsgs });
check(longRes.input_tokens > longRes.output_tokens, `long-input compression ${longRes.input_tokens} -> ${longRes.output_tokens} tokens`);

// ---------------------------------------------------------------- mcp / skills
console.log("\nMarketplace tools:");
const mcpList = await runTool("mcp_list_servers", {});
check(Array.isArray(mcpList.servers) && mcpList.servers.length >= 5, `MCP catalog: ${mcpList.servers.length} servers`);
const skillList = await runTool("skill_list", {});
check(Array.isArray(skillList.skills) && skillList.skills.length >= 5, `skill catalog: ${skillList.skills.length} skills`);
const skillUse = await runTool("skill_use", { skill_id: "code-review", task: "review test.js" });
check(skillUse.instructions.length > 10, "skill_use returns instructions");

// ---------------------------------------------------------------- presentations
console.log("\nPresentation tools:");
const deck = await runTool("presentation_generate", { topic: "AI Agents", slides: 4, output: "test-deck" });
check(existsSync(deck.markdown), `markdown deck written`);
check(existsSync(deck.html), `html deck written`);
check(deck.pptx === "" || existsSync(deck.pptx) || deck.pptx.includes("unavailable"), `pptx: ${deck.pptx}`);

// ---------------------------------------------------------------- summary
console.log(`\n${"=".repeat(50)}`);
console.log(`Passed: ${pass}  Failed: ${fail}`);
if (failures.length) console.log("Failures:", failures.join(", "));

// cleanup (retry; sharp/PowerShell may briefly hold file handles)
for (let i = 0; i < 5; i++) {
	try { rmSync(work, { recursive: true, force: true }); break; }
	catch { await new Promise((r) => setTimeout(r, 500)); }
}
process.exit(fail === 0 ? 0 : 1);
