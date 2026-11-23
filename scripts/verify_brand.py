"""KK Go 品牌层验收闸门。

背景：此前品牌插件有两层故障，两层都不会让构建失败，只会让用户看到"界面没换品牌"：
  1. 包不在 dsh 的解析域内 —— dsh 的运行时解析器只认「安装域」(app/dsh/package.json 声明的依赖)
     和「profile 域」(profile 自己的 node_modules) 两类包。自定义包不在其中时，ESM 解析直接
     ERR_MODULE_NOT_FOUND，服务端只打印一行 warning。
  2. 浏览器半边写成裸 ESM —— 前端 ModuleLoader 的 factory 体里没有 exports 变量，
     `exports.apply = ...` 会抛 "exports is not defined"，前端只报一行 "import failed"。

所以这个闸门不用 --dump-config（它只看配置树，不 import 插件，必然放行），而是：
  真起服务 -> 抓 stdout 有没有 activation 失败 -> 抓真正下发给前端的 HTML，
  断言 boot 清单里含 ui-brand-kkgo、且页面标题已是 KK Go。

用法: python verify_brand.py <app目录> [端口]
退出码 0 = 通过；非 0 = 构建必须失败。
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from http.cookiejar import CookieJar

# dsh web 的鉴权是「一次性 token URL -> 下发签名 cookie -> 302 到真正的页面」。
# 不带 cookie jar 直接请求会拿到 401（"dsh web authentication required"），
# 所以这里必须用带 CookieProcessor 的 opener，让重定向链上的 Set-Cookie 跟过去。
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def fetch(url):
    with _opener.open(url, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")

app = os.path.abspath(sys.argv[1])
port = int(sys.argv[2]) if len(sys.argv) > 2 else 19851
node = os.path.join(app, "runtime", "node.exe")
bin_js = os.path.join(app, "dsh", "lib", "bin.js")
patch = os.path.join(app, "profiles", "kkgo.patch.yml")

failures = []


def fail(msg):
    failures.append(msg)
    print("    FAIL: " + msg)


for p in (node, bin_js, patch):
    if not os.path.exists(p):
        print("verify_brand: missing " + p)
        sys.exit(1)

# 用一个全新的 DSH_HOME：模拟"用户第一次装完就启动"的真实场景，
# 而不是复用已被各种手工操作污染过的本机 profile。
home = tempfile.mkdtemp(prefix="kkgo_brand_gate_")
env = dict(os.environ)
env["NODE_PATH"] = os.path.join(app, "dsh", "node_modules")
env["DSH_HOME"] = home

proc = subprocess.Popen(
    [node, bin_js, "--profile", "web", "--patch", patch, "--no-open", "--port", str(port)],
    cwd=app, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
)

lines = []
url = None
html = ""
deadline = time.time() + 90
while time.time() < deadline:
    raw = proc.stdout.readline()
    if not raw:
        if proc.poll() is not None:
            break
        continue
    text = raw.decode("utf-8", "replace").rstrip()
    lines.append(text)
    m = re.search(r"http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_\-]+", text)
    if m:
        url = m.group(0)
        # 必须在服务还活着的时候把页面抓下来 —— 抓完再停。
        time.sleep(1.5)
        try:
            html = fetch(url)
        except Exception as exc:
            print("    FAIL: cannot fetch the served page: %s" % exc)
        break

try:
    proc.terminate()
    proc.wait(timeout=10)
except Exception:
    proc.kill()
finally:
    shutil.rmtree(home, ignore_errors=True)

blob = "\n".join(lines)

# --- 闸门 1：服务端不得有插件激活失败 ---
if "did not activate" in blob:
    fail("server reported an entry that did not activate:\n" +
         "\n".join(l for l in lines if "activate" in l or "failed to import" in l))
if "failed to import" in blob:
    fail("server failed to import a plugin:\n" +
         "\n".join(l for l in lines if "failed to import" in l))
if "ERR_MODULE_NOT_FOUND" in blob:
    fail("ESM resolution failed inside dsh:\n" +
         "\n".join(l for l in lines if "ERR_MODULE_NOT_FOUND" in l or "Cannot find package" in l))

if url is None:
    fail("dsh service never reported a listening URL:\n" + "\n".join(lines[-30:]))
    print("verify_brand: FAILED (%d problem(s))" % len(failures))
    sys.exit(1)

# --- 闸门 2：真正下发给前端的 HTML 必须含 KK Go 品牌条目与新标题 ---
if html:
    if "ui-brand-kkgo" not in html:
        fail("client boot manifest does not carry 'ui-brand-kkgo' — the brand plugin never reached the browser")
    if "ui-brand-official" in html:
        fail("client boot manifest still carries 'ui-brand-official' — both brands would be rendered")
    if "<title>KK Go</title>" not in html:
        fail("page title is not 'KK Go' (frontend index.html was not rebranded)")
    else:
        print("    OK: client boot carries ui-brand-kkgo, upstream brand removed, title = KK Go")

if failures:
    print("verify_brand: FAILED (%d problem(s))" % len(failures))
    sys.exit(1)

print("    OK: no activation failure, brand plugin loaded and delivered to the browser")
sys.exit(0)
