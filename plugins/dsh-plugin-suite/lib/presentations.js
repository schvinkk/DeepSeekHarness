/**
 * Presentation tools: generate a complete slide deck from a topic.
 * Produces a real .pptx (OPC package), an HTML slideshow, and a markdown
 * outline — all saved to the workspace.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function esc(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Build a slide XML document with a title and bullet body. */
function slideXml(title, bullets) {
	const body = bullets
		.map((b, i) => {
			const lines = String(b).split("\n");
			const first = lines[0];
			const rest = lines.slice(1)
				.map((l) => `<a:br/><a:r><a:rPr lang="zh-CN" sz="1600"/><a:t>${esc(l)}</a:t></a:r>`)
				.join("");
			return `<a:p><a:pPr lvl="${Math.min(i, 4)}"/><a:r><a:rPr lang="zh-CN" sz="1600" dirty="0"/><a:t>${esc(first)}</a:t></a:r>${rest}</a:p>`;
		})
		.join("");
	return `${XML_HEAD}
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="2800" b="1" dirty="0"/><a:t>${esc(title)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>`;
}

function buildPptxFiles(slides, dir) {
	// [Content_Types].xml
	writeFileSync(join(dir, "[Content_Types].xml"), `${XML_HEAD}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slides.map((_, i) => `  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n")}
</Types>`);

	// _rels/.rels
	writeFileSync(join(dir, "_rels", ".rels"), `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

	// ppt/presentation.xml
	writeFileSync(join(dir, "ppt", "presentation.xml"), `${XML_HEAD}
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

	// ppt/_rels/presentation.xml.rels
	writeFileSync(join(dir, "ppt", "_rels", "presentation.xml.rels"), `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slides.map((_, i) => `  <Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n")}
</Relationships>`);

	// slides
	slides.forEach((s, i) => {
		writeFileSync(join(dir, "ppt", "slides", `slide${i + 1}.xml`), slideXml(s.title, s.bullets));
		writeFileSync(join(dir, "ppt", "slides", "_rels", `slide${i + 1}.xml.rels`), `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
	});

	// slide master + layout + theme (minimal but valid)
	writeFileSync(join(dir, "ppt", "slideMasters", "slideMaster1.xml"), `${XML_HEAD}
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="2800" b="1"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="1600"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle/>
  </p:txStyles>
</p:sldMaster>`);
	writeFileSync(join(dir, "ppt", "slideMasters", "_rels", "slideMaster1.xml.rels"), `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);
	writeFileSync(join(dir, "ppt", "slideLayouts", "slideLayout1.xml"), `${XML_HEAD}
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`);
	writeFileSync(join(dir, "ppt", "slideLayouts", "_rels", "slideLayout1.xml.rels"), `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
	writeFileSync(join(dir, "ppt", "theme", "theme1.xml"), `${XML_HEAD}
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`);
}

async function zipDir(srcDir, outZip) {
	const script = `
		Add-Type -AssemblyName System.IO.Compression.FileSystem;
		if (Test-Path "${outZip.replace(/\\/g, "\\\\")}") { Remove-Item "${outZip.replace(/\\/g, "\\\\")}" -Force };
		[System.IO.Compression.ZipFile]::CreateFromDirectory("${srcDir.replace(/\\/g, "\\\\")}", "${outZip.replace(/\\/g, "\\\\")}");
	`;
	await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 30000, windowsHide: true });
}

/** Generate a slide deck structure from a topic. */
function buildDeck(topic, slideCount) {
	const sections = [
		["Introduction", `Overview and goals of ${topic}`],
		["Background", `Context and motivation for ${topic}`],
		["Key Concepts", `Core concepts of ${topic}`],
		["Benefits", `Advantages and value of ${topic}`],
		["Implementation", `How to implement ${topic}`],
		["Case Studies", `Real-world examples of ${topic}`],
		["Challenges", `Common challenges with ${topic}`],
		["Best Practices", `Best practices for ${topic}`],
		["Future Trends", `The future of ${topic}`],
		["Conclusion", `Summary of ${topic}`]
	];
	const count = Math.min(Math.max(slideCount - 2, 2), sections.length);
	const slides = [
		{ title: topic, bullets: ["Presentation generated by DeepSeek Harness", "v2.95.27 Plugin Suite"] }
	];
	for (let i = 0; i < count; i++) {
		const [title, desc] = sections[i];
		slides.push({
			title,
			bullets: [desc, "Key point 1", "Key point 2", "Key point 3"]
		});
	}
	slides.push({ title: "Thank You", bullets: ["Questions?", "Q&A"] });
	return slides;
}

export function registerPresentationTools(ctx) {
	ctx.tools.register(defineTool({
		name: "presentation_generate",
		description: "Generate a complete slide deck (pptx + html + markdown outline) from a topic and save it.",
		parameters: {
			topic: { type: "string", required: true, description: "Presentation topic." },
			slides: { type: "number", description: "Approximate slide count (default 8, max 12)." },
			output: { type: "string", description: "Output basename (default: presentation)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					pptx: { type: "string", required: true },
					html: { type: "string", required: true },
					markdown: { type: "string", required: true }
				}
			},
			render: (args, value) => [
				`PPTX: <path>${value.pptx}</path>`,
				`HTML: <path>${value.html}</path>`,
				`MD:   <path>${value.markdown}</path>`
			].join("\n")
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const base = args.output || "presentation";
			const topic = args.topic;
			const deck = buildDeck(topic, Math.min(args.slides ?? 8, 12));

			// Markdown outline
			const md = [`# ${topic}`, ""]
				.concat(deck.map((s) => [`## ${s.title}`, "", ...s.bullets.map((b) => `- ${b}`), ""]).flat())
				.join("\n");
			const mdPath = resolve(process.cwd(), `${base}.md`);
			writeFileSync(mdPath, md, "utf-8");

			// HTML slideshow
			const htmlSlides = deck.map((s) => `<section><h2>${esc(s.title)}</h2><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>`).join("\n");
			const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(topic)}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#1a1a2e;color:#eee;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}section{max-width:900px;padding:40px;background:#16213e;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4)}h2{color:#4cc9f0;font-size:2em;margin-top:0}li{font-size:1.3em;line-height:1.8}</style></head>
<body>${htmlSlides}
<script>let i=0;const s=document.querySelectorAll('section');s.forEach((x,j)=>x.style.display=j===0?'block':'none');document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '){i=Math.min(i+1,s.length-1)}if(e.key==='ArrowLeft'){i=Math.max(i-1,0)}s.forEach((x,j)=>x.style.display=j===i?'block':'none')})</script></body></html>`;
			const htmlPath = resolve(process.cwd(), `${base}.html`);
			writeFileSync(htmlPath, html, "utf-8");

			// PPTX
			let pptxPath = "";
			try {
				const workDir = join(tmpdir(), `dsh-pptx-${Date.now()}`);
				for (const d of ["_rels", "ppt/_rels", "ppt/slides/_rels", "ppt/slideMasters/_rels", "ppt/slideLayouts/_rels", "ppt/theme"]) {
					mkdirSync(join(workDir, d), { recursive: true });
				}
				buildPptxFiles(deck, workDir);
				pptxPath = resolve(process.cwd(), `${base}.pptx`);
				await zipDir(workDir, pptxPath);
				rmSync(workDir, { recursive: true, force: true });
				if (!existsSync(pptxPath)) pptxPath = "";
			} catch {
				pptxPath = "";
			}

			return { pptx: pptxPath || "(pptx generation unavailable)", html: htmlPath, markdown: mdPath };
		}
	}));
}
