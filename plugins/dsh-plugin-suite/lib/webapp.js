/**
 * Build Web Apps tool: scaffold a complete, self-contained single-file web app
 * (landing page, admin dashboard, internal tool, SaaS MVP) from a short
 * description, and save it as an .html file.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

function esc(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function landing(name, desc) {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#333}
.hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:40px}
.hero h1{font-size:3.5em;margin-bottom:20px}
.hero p{font-size:1.3em;max-width:600px;margin-bottom:30px;opacity:.95}
.cta{display:inline-block;padding:16px 40px;background:#fff;color:#667eea;border-radius:8px;font-size:1.1em;font-weight:600;text-decoration:none;transition:transform .2s}
.cta:hover{transform:translateY(-2px)}
.features{display:flex;flex-wrap:wrap;justify-content:center;gap:30px;padding:80px 40px}
.feature{flex:1;min-width:260px;max-width:360px;padding:30px;background:#f7f7fb;border-radius:12px;text-align:center}
.feature h3{color:#667eea;margin-bottom:12px}
</style>
</head>
<body>
<div class="hero">
  <h1>${esc(name)}</h1>
  <p>${esc(desc)}</p>
  <a href="#" class="cta">立即开始</a>
</div>
<div class="features">
  <div class="feature"><h3>快速</h3><p>秒级启动，无需复杂配置</p></div>
  <div class="feature"><h3>安全</h3><p>数据加密存储，安全可靠</p></div>
  <div class="feature"><h3>灵活</h3><p>高度可定制，满足各种场景</p></div>
</div>
</body>
</html>`;
}

function dashboard(name, desc) {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} - 管理后台</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;display:flex;min-height:100vh;background:#f0f2f5}
.sidebar{width:240px;background:#1f2937;color:#fff;padding:24px;display:flex;flex-direction:column}
.sidebar h2{margin-bottom:30px;font-size:1.2em}
.sidebar a{color:#9ca3af;text-decoration:none;padding:10px 12px;border-radius:6px;margin-bottom:4px}
.sidebar a:hover,.sidebar a.active{background:#374151;color:#fff}
.main{flex:1;padding:30px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:30px}
.card{background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.card .num{font-size:2.2em;font-weight:700;color:#667eea;margin:8px 0}
.card .label{color:#6b7280;font-size:.9em}
table{width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)}
th,td{padding:14px 18px;text-align:left;border-bottom:1px solid #f3f4f6}
th{background:#f9fafb;color:#6b7280;font-size:.85em}
</style>
</head>
<body>
<div class="sidebar">
  <h2>${esc(name)}</h2>
  <a href="#" class="active">仪表盘</a>
  <a href="#">数据分析</a>
  <a href="#">用户管理</a>
  <a href="#">设置</a>
</div>
<div class="main">
  <h1 style="margin-bottom:24px">仪表盘</h1>
  <div class="cards">
    <div class="card"><div class="label">总用户</div><div class="num">1,284</div></div>
    <div class="card"><div class="label">今日访问</div><div class="num">3,672</div></div>
    <div class="card"><div class="label">订单</div><div class="num">289</div></div>
    <div class="card"><div class="label">收入</div><div class="num">¥52,400</div></div>
  </div>
  <table>
    <tr><th>用户</th><th>状态</th><th>最近活动</th></tr>
    <tr><td>张三</td><td>活跃</td><td>2分钟前</td></tr>
    <tr><td>李四</td><td>活跃</td><td>15分钟前</td></tr>
    <tr><td>王五</td><td>离线</td><td>2小时前</td></tr>
  </table>
  <p style="margin-top:30px;color:#6b7280">${esc(desc)}</p>
</div>
</body>
</html>`;
}

function internalTool(name, desc) {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} - 内部工具</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;display:flex;justify-content:center;padding:60px 20px}
.tool{background:#fff;border-radius:12px;padding:40px;width:100%;max-width:640px;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.tool h1{font-size:1.6em;margin-bottom:8px;color:#1f2937}
.tool .desc{color:#6b7280;margin-bottom:24px}
label{display:block;font-weight:600;margin:16px 0 6px;color:#374151}
input,textarea,select{width:100%;padding:11px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:1em}
button{margin-top:24px;width:100%;padding:13px;background:#667eea;color:#fff;border:none;border-radius:8px;font-size:1em;font-weight:600;cursor:pointer}
button:hover{background:#5a6fd6}
#result{margin-top:20px;padding:16px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap;display:none}
</style>
</head>
<body>
<div class="tool">
  <h1>${esc(name)}</h1>
  <p class="desc">${esc(desc)}</p>
  <label for="input">输入</label>
  <textarea id="input" rows="4" placeholder="在这里输入内容..."></textarea>
  <label for="mode">处理方式</label>
  <select id="mode">
    <option value="upper">转大写</option>
    <option value="count">字数统计</option>
    <option value="json">JSON 格式化</option>
  </select>
  <button onclick="run()">处理</button>
  <div id="result"></div>
</div>
<script>
function run(){
  const input=document.getElementById('input').value;
  const mode=document.getElementById('mode').value;
  const out=document.getElementById('result');
  if(mode==='upper'){out.textContent=input.toUpperCase();}
  else if(mode==='count'){out.textContent='字符数: '+input.length+'\\n字数: '+input.trim().split(/\\s+/).filter(Boolean).length;}
  else if(mode==='json'){try{out.textContent=JSON.stringify(JSON.parse(input),null,2);}catch(e){out.textContent='JSON 解析失败: '+e.message;}}
  out.style.display='block';
}
</script>
</body>
</html>`;
}

function saasMvp(name, desc) {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} - SaaS</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937}
.nav{display:flex;justify-content:space-between;align-items:center;padding:18px 40px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.06);position:sticky;top:0}
.nav h2{color:#667eea}
.nav a{color:#374151;text-decoration:none;margin-left:24px}
.hero{text-align:center;padding:90px 20px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
.hero h1{font-size:3em;margin-bottom:16px}
.hero p{font-size:1.2em;opacity:.95;max-width:640px;margin:0 auto 30px}
.pricing{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;padding:70px 20px}
.plan{background:#fff;border-radius:14px;padding:36px;width:280px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08);transition:transform .2s}
.plan:hover{transform:translateY(-4px)}
.plan.featured{border:2px solid #667eea}
.plan h3{color:#667eea;margin-bottom:10px}
.plan .price{font-size:2.6em;font-weight:700;margin:14px 0}
.plan ul{list-style:none;color:#6b7280;margin-bottom:24px}
.plan li{padding:6px 0}
.plan button{width:100%;padding:12px;border:none;border-radius:8px;background:#667eea;color:#fff;font-size:1em;font-weight:600;cursor:pointer}
footer{text-align:center;padding:30px;color:#9ca3af;border-top:1px solid #eee}
</style>
</head>
<body>
<div class="nav">
  <h2>${esc(name)}</h2>
  <div><a href="#pricing">定价</a><a href="#">登录</a><a href="#">注册</a></div>
</div>
<div class="hero">
  <h1>${esc(name)}</h1>
  <p>${esc(desc)}</p>
  <button style="padding:14px 36px;border:none;border-radius:8px;background:#fff;color:#667eea;font-size:1.05em;font-weight:600;cursor:pointer">免费试用</button>
</div>
<div class="pricing" id="pricing">
  <div class="plan"><h3>免费版</h3><div class="price">¥0</div><ul><li>基础功能</li><li>1 个项目</li><li>社区支持</li></ul><button>开始使用</button></div>
  <div class="plan featured"><h3>专业版</h3><div class="price">¥99/月</div><ul><li>全部功能</li><li>无限项目</li><li>优先支持</li></ul><button>立即升级</button></div>
  <div class="plan"><h3>企业版</h3><div class="price">定制</div><ul><li>专属部署</li><li>SLA 保障</li><li>专属客服</li></ul><button>联系我们</button></div>
</div>
<footer>© ${new Date().getFullYear()} ${esc(name)} · 由 DeepSeek Harness 生成</footer>
</body>
</html>`;
}

const TEMPLATES = {
	landing: landing,
	dashboard: dashboard,
	tool: internalTool,
	saas: saasMvp
};

export function registerWebAppTools(ctx) {
	ctx.tools.register(defineTool({
		name: "webapp_generate",
		description: "Generate a complete single-file web app (landing page, admin dashboard, internal tool, or SaaS MVP) from a name and description, and save it as HTML.",
		parameters: {
			name: { type: "string", required: true, description: "App name." },
			description: { type: "string", description: "App description / tagline." },
			type: {
				type: "string",
				description: "App type: landing | dashboard | tool | saas (default: landing)."
			},
			output: { type: "string", description: "Output filename (default: <name>.html)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					bytes: { type: "integer", required: true },
					type: { type: "string", required: true }
				}
			},
			render: (args, value) => `Generated ${value.type} web app (${value.bytes} bytes) -> <path>${value.path}</path>`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const type = args.type || "landing";
			const builder = TEMPLATES[type];
			if (!builder) throw new Error(`unknown type: ${type} (use landing | dashboard | tool | saas)`);
			const html = builder(args.name, args.description || `${args.name} — a ${type} app`);
			const outPath = resolve(process.cwd(), args.output || `${args.name.replace(/[^\w-]+/g, "-").toLowerCase() || "app"}.html`);
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(outPath, html, "utf-8");
			return { path: outPath, bytes: Buffer.byteLength(html), type };
		}
	}));
}
