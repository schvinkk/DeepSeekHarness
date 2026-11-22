/*
 * DeepSeek Harness - dsh 0.2.2-rc.5 运行时自愈补丁
 *
 * 善后/自愈目标：
 *   rc.5 的 dsh-api-session-controller 里有一处裸变量调用
 *     else if (content.some(part => part.type === `file`)) ...
 *   若上游传入的 content 不是数组（字符串 / 对象 / null），
 *   content.some is not a function 会让整个会话崩溃。
 *
 * 修法（最小、最安全、表达式级）：
 *   只把「裸变量 content.some(」替换为
 *     (Array.isArray(content)?content:[]).some(
 *   这是纯表达式替换，不插入语句、不碰 block.content.some / node.content.some
 *   这类成员访问（那些参数本来就是数组），因此不会破坏 minify 后的单行文件。
 *
 * 自愈/善后特性：
 *   - 幂等：带 [DSH-HARNESS-PATCH] 标记即跳过；重复替换也不会叠加
 *   - 精准：只匹配裸变量调用，绝不匹配 obj.content.some
 *   - 语法自检：写入前用 node --check 校验，校验不过就回滚、绝不落盘
 *   - 失败安全：任何单点失败只 SKIP，整体以 0 退出，绝不因补丁阻断启动
 *
 * 用法: node patch-runtime.js   (仓库根目录；兼容旧 packaging/ 目录)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MARK = '[DSH-HARNESS-PATCH]';

// 只处理 rc.5 里可能收到裸 content 的 api-session-controller。
// 其余包的 .some 都是 block.content / node.content 成员访问，参数即数组，无需补丁。
const TARGETS = [
  'dsh-api-session-controller/lib/client.js',
];

function findDshRoot() {
  const candidates = [
    path.join(__dirname, 'app', 'dsh', 'node_modules', '@deepseek-ai'),
    path.join(__dirname, 'packaging', 'app', 'dsh', 'node_modules', '@deepseek-ai'),
    path.join(__dirname, 'node_modules', '@deepseek-ai'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0];
}

// 判断匹配点前是不是成员访问（前面紧邻非空白字符是 '.' 或标识符字符）。
// 裸变量调用的前一个字符通常是 '(' ';' '=' ',' '{' 或空白。
function isBareCall(source, index) {
  let j = index - 1;
  while (j >= 0 && /\s/.test(source[j])) j--;
  if (j < 0) return true;
  const c = source[j];
  // 前面是 '.' → obj.content.some；前面是标识符/数字/']'/')' → 也可能是成员链
  if (c === '.' || /[A-Za-z0-9_$\]\)]/.test(c)) return false;
  return true;
}

function applyTo(file) {
  const label = path.basename(path.dirname(file)) + '/' + path.basename(file);
  if (!fs.existsSync(file)) {
    console.log('SKIP (missing):', label);
    return;
  }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(MARK)) {
    console.log('ALREADY PATCHED:', label);
    return;
  }
  const orig = s;

  // 表达式级替换：content.some(  ->  (Array.isArray(content)?content:[]).some(
  // 用函数回调逐个判断，跳过成员访问与非裸变量。
  s = s.replace(/content\.some\(/g, (match, offset) => {
    if (!isBareCall(orig, offset)) return match;
    return '(Array.isArray(content)?content:[]).some(';
  });

  if (s === orig) {
    console.log('NO CHANGE (no bare content.some):', label);
    return;
  }
  // 标记必须是注释形式；裸拼 [X] 后跟标识符会造成语法错误。
  if (!s.includes(MARK)) s = '/* ' + MARK + ' */\n' + s;

  // 自愈关键：写盘前做语法自检，不过则放弃（不制造崩溃）。
  // 注意：node --check 对非 .js 后缀会按 ESM 解析导致误判，临时文件必须用 .js 后缀。
  const dir = path.dirname(file);
  const base = path.basename(file);
  const tmp = path.join(dir, base + '.dshpatch.tmp.js');
  try {
    fs.writeFileSync(tmp, s, 'utf8');
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'ignore' });
    fs.renameSync(tmp, file);
    console.log('PATCHED (syntax verified):', label);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    console.log('SKIP (syntax check failed, rolled back):', label, '-', String(e.message).split('\n')[0]);
  }
}

function main() {
  const root = findDshRoot();
  console.log('[DSH-HARNESS-PATCH] dsh runtime self-heal patch');
  console.log('dsh node_modules root:', root);
  for (const rel of TARGETS) {
    try {
      applyTo(path.join(root, rel));
    } catch (e) {
      console.log('SKIP (error):', rel, '-', e.message);
    }
  }
  console.log('[DSH-HARNESS-PATCH] done (non-fatal by design).');
}

main();
