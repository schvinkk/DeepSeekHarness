/*
 * DeepSeek Harness - dsh-client-runtime 运行时补丁
 * 修复: 调用 prompt() / 渲染预览时 content 非数组导致 `content.some is not a function` 崩溃
 * 幂等: 已打过补丁的文件会自动跳过
 * 用法: node patch-runtime.js   (在 packaging/ 目录下运行)
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname, 'app', 'dsh', 'node_modules', '@deepseek-ai',
  'dsh-client-runtime', 'lib', 'client.js'
);

function applyPatch(file) {
  if (!fs.existsSync(file)) { console.log('SKIP (missing):', file); return; }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('[DSH-PATCH]') || s.includes('!Array.isArray(content)')) { console.log('ALREADY PATCHED:', file); return; }
  const orig = s;

  // 1) prompt() 入口: 把 content 规范化为数组
  s = s.replace(/(this\.notifier\.markDirty\(\);\n)(\s*)(let result;)/, (m, a, ind) => {
    const lines = [
      '// [DSH-PATCH] content normalize',
      'if (typeof content === "string") content = [{ type: "text", text: content }];',
      'else if (content != null && !Array.isArray(content)) {',
      '\tif (content && typeof content === "object" && content.type) content = [content];',
      '\telse {',
      '\t\tconst _t = (content && typeof content === "object") ? (content.text ?? content.content ?? "") : String(content);',
      '\t\tcontent = [{ type: "text", text: String(_t) }];',
      '\t}',
      '} else if (content == null) content = [];',
    ].map((l) => ind + l).join('\n');
    return a + lines + '\n' + ind + 'let result;';
  });

  // 2) toAssistantBlocks
  s = s.replace(/(\s*)return content\.map\(toAssistantBlock\);/, (m, ind) =>
    ind + 'if (!Array.isArray(content)) content = content == null ? [] : [{ type: "text", text: String(content) }];\n' + m);

  // 3) previewOf
  s = s.replace(/(\s*)const flat = content\.map\(/, (m, ind) =>
    ind + 'if (!Array.isArray(content)) content = content == null ? [] : [{ type: "text", text: String(content) }];\n' + m);

  // 4) textOf
  s = s.replace(/(\s*)if \(!content\.every\(\(block\) => block\.type === "text"\)\) return null;/, (m, ind) =>
    ind + 'if (!Array.isArray(content)) return null;\n' + m);

  if (s === orig) { console.log('NO CHANGE:', file); return; }
  fs.writeFileSync(file, s, 'utf8');
  console.log('PATCHED:', file);
}

applyPatch(target);
