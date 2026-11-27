# KK Go 桌面版 — 打包工程

把 dsh 内核（`@deepseek-ai/dsh`）封装成**普通用户可直接安装使用的
Windows 桌面客户端安装包**，与手机端 dsh-Go 同属一套「KK Go」品牌：安装包自带
Node.js 运行时与全部依赖，无需用户安装任何开发环境；内置黑色鲸鱼图标（由
`scripts/make-icon.cjs` 零依赖生成）。

> **v3.0.0 补全说明**：本仓库此前只有构建脚本、没有任何打包源文件，是个无法构建的
> 空壳。现已补齐全部缺失文件（`scripts/Launcher.cs`、`scripts/DshClient.cs`、
> `scripts/app.manifest`、`scripts/make-icon.cjs`、`icon/whale.ico`、
> `installer/installer.iss`、`app/docs/数字签名指南.md`），并在 `build.ps1` 中移除了
> 指向虚构插件包的依赖（那是启动即崩溃的根源）。现在可以真正打包出安装包。

## 开箱即用：内置能力清单（不用你自己装任何插件）

**核心卖点**：这个安装包**已经把 dsh 内核的全部常用官方能力内置好了**。用户下载、安装、双击打开，
只要在「设置 → 模型」里填上自己的大模型（DeepSeek / OpenAI 兼容 / Anthropic / Gemini 等）的 API Key，
下面这些功能**全部直接可用，无需再去开源平台找插件安装、无需任何开发环境**。

内置能力（来自内核 `standard` preset + 品牌层，随包分发，启动即激活）：

| 类别 | 内置能力 | 说明 |
|---|---|---|
| 对话与人格 | 角色人设（persona）、Agent 指令（agent-instructions）、时间上下文（time-context） | 开箱即对话 |
| 终端执行 | PowerShell（Windows 上启用）、Bash（非 Windows 启用） | 能跑命令 |
| 文件 | 读写/编辑文件（tool-fs）、文件搜索（tool-fs-search） | 操作本机文件 |
| 任务与计划 | 定时任务（tool-jobs）、日程（tool-schedule）、目标（command-goal / tool-goal）、规划模式（plan-mode） | 长任务、计划 |
| 技能 | 技能加载（tool-skill）、文件系统技能（skill-filesystem） | 内置 skills |
| 上下文管理 | 自动压缩（compaction-basic / command-compact / tool-result-pruner） | 长对话不爆上下文 |
| 子代理/工作流 | 子代理控制、子代理（spawn/fork）、workflow（tool-workflow / workflow-ptc） | 多代理协作 |
| 交互 | 提问（tool-ask-user）、待办（tool-todo）、展示结果（present） | 交互式协作 |
| 联网 | 网页获取 + 搜索（tool-web） | 联网查资料 |
| 办公 | 办公文档（tool-office） | 处理文档 |
| 插件管理 | 插件管理器（tool-plugin-manager） | 在界面内按需管理插件 |

> 也就是说：**下载这个安装包 = 已经装好了上面整套能力**。用户唯一要做的就是配置自己的大模型。
> 想要更多/第三方插件时，可在软件内的「插件管理」里安装，不是必须的。

## 版本更新（保姆级教程）

**用户不需要卸载重装、不需要手动迁移任何数据。** 只要版本比当前旧，按下面做即可，
整个过程和装普通软件一样，直接**覆盖**在原来上面：

1. **判断是否需要更新**：打开软件，托盘右键 → 「关于」，或看安装目录 `docs` 里的版本号；
   如果你手上的版本号比 GitHub 最新版（见本页「交付物」里的 `dist\KKGo-Setup-x.y.z.exe`）小，就更新。
2. **下载最新版安装包**：到本仓库 Releases / 下载页，下载最新的 `KKGo-Setup-x.y.z.exe`。
   （若浏览器提示"未知发布者/没有通过安全验证"，点"仍要运行"即可，见下方「数字签名」说明。）
3. **直接双击运行新版安装包**：
   - 安装器 **AppId 固定不变**，因此**同一个 AppId 重装 = 原地覆盖升级**，
     直接盖在你已安装的版本上，**不会变成第二个软件**；
   - 安装向导会**自动识别到已安装**并提示"检测到已安装，是否升级"，一路点"下一步"即可；
   - **安装位置、开机自启、桌面快捷方式、防火墙规则都会保留**；
   - 你的全部数据（会话、配置、API 密钥，在数据目录里）**原样保留**，升级后登录态不变。
4. **完成后点"立即启动"**：服务与数据无缝衔接，秒开。

> 一句话记住：**新版安装包直接双击 → 选"升级/下一步" → 数据自动保留 → 完事。** 老版本自动被覆盖。

## 功能特性

- **桌面客户端（原生窗口）**：双击图标启动本地服务并弹出**原生客户端窗口**
  （系统 WebView2 内核，无浏览器外壳），窗口与任务栏**统一黑色鲸鱼图标**；
  WebView2 运行时缺失时回退到带鲸鱼图标的 Edge 应用窗口 / 默认浏览器
- **托盘常驻**：启动后系统托盘常驻黑色鲸鱼图标 —— 打开窗口 / 重启服务 /
  停止服务释放内存 / 更改数据目录 / 开机自启开关 / 检查更新 / 打开数据目录 /
  查看日志 / 关于 KK Go / 退出（完整功能，不是精简版）
- **开机自启**：安装时可勾选，或托盘菜单随时开关（写入 HKCU 启动项，卸载自动清理）
- **自定义安装目录**：安装向导可自由选择目录（默认用户目录，无需管理员权限）
- **单实例守护**：重复点击不产生多进程；服务异常退出时托盘提示并可一键重启
- **专用端口 18632**：与 dsh 命令行版/harness 的 3080 隔离，同机共存不冲突
- **日志轮转**：安装目录下 `.kkgo\desktop.log` 超 1MB 自动轮转，不占磁盘；用户数据默认放**非 C 盘**（安装目录下的 `KK Go Data`，或 `D:\KK Go Data` 等），托盘「更改数据目录」可自选任意盘。WebViews 缓存随数据目录走，路径强制绝对路径，绝不占 C 盘、绝不给浏览器相对路径
- **性能友好**：托盘进程 BelowNormal 优先级不抢资源；常驻内存约 175MB；
  冷启动约 5–10s、热启动 3–6s、常驻后客户端**秒开**

## 崩溃自愈 / 善后处理

桌面版按「出错能自己恢复」设计，构建与运行两条链都有兜底：

| 层面 | 机制 | 位置 |
|---|---|---|
| 服务进程崩溃 | 托盘监护到 `Exited` 后延迟自动重启，连续失败 5 次才停下并提示、不无限空转 | `Launcher.cs` `Service_Exited` |
| 服务启动超时 | 就绪等待上限 150 秒，超时气泡提示，不卡死 | `Launcher.cs` `BeginWaitAndOpen` |
| 重复启动 | 单实例互斥，第二个实例只通知已有实例开窗后退出 | `Launcher.cs` Mutex |
| 日志撑爆磁盘 | `desktop.log` 超 1MB 自动轮转，最多保留 `.1~.3` | `Launcher.cs` `Log/RotateLogs` |
| 运行时 content 崩溃 | 启动打包时对 rc.5 的裸 `content.some` 注入数组守卫；带语法自检，校验不过自动回滚，绝不落坏文件 | `patch-runtime.js` |
| 构建完整性 | 内核插件不足 5 个直接拒绝出包，避免交付残缺包 | `build.ps1` 第 4 步 |
| 升级遗留 | 自动清除历史虚构依赖 `dsh-plugin-suite`，避免升级后仍带崩溃源 | `build.ps1` 第 4 步 |

> 自愈原则：任何单点失败都只 `SKIP`/回滚并以 0 退出，绝不因补丁或日志问题反过来把客户端弄崩。

## 交付物

| 文件 | 说明 |
|---|---|
| `dist\KKGo-Setup-3.1.5.exe` | **最新正式安装包**（约 156MB，内置 Node 运行时 + dsh 内核 + 全部依赖 + 品牌层），发给用户直接安装。GitHub Release 同步提供，带 `.sha256` 校验文件 |
| `start-dsh-3080.bat` | 命令行/PWA 版启动脚本：用**全局 `dsh web`** 启动 3080 端口，避免 `npx` 导致的 profile bundle 解析失败 |
| `app\KK Go.exe` | 托盘启动器 + 原生客户端窗口（无参=启动并打开窗口；`--startup`=静默常驻；`stop`=停止服务；`--shutdown`=彻底关闭） |
| `app\Microsoft.Web.WebView2.*.dll` + `WebView2Loader.dll` | WebView2 SDK（承载原生窗口，随包分发） |
| `app\runtime\node.exe` | 内置 Node.js v24.22.1 便携运行时（随包分发） |
| `app\dsh\` | `@deepseek-ai/dsh` 完整包 + 全部依赖（已裁剪 sourcemap 与非 Windows 预编译模块） |
| `app\profiles\web\` | web profile 模板（首次启动自动复制到用户数据目录） |
| `app\docs\` | 使用说明.md、数字签名指南.md（随安装包分发） |
| `icon\whale.ico` | 多尺寸（16–256px）黑色鲸鱼图标 |
| `installer\installer.iss` | Inno Setup 安装脚本（中文向导、自定义目录、开机自启选项、卸载程序） |

## 桌面端和网页端的关系（一个内核，两种入口）

**理解本项目的关键**：桌面客户端和浏览器网页端**不是两套软件**，而是**同一个本地服务、
同一份数据、同一套插件**的两种外壳：

- 桌面窗口是原生外壳（WebView2），打开的页面就是本地服务
  `http://127.0.0.1:18632/?token=...` 提供的**完整 KK Go 界面**；
- 浏览器打开同一地址看到的是**一模一样的界面、会话、插件** —— 同一个服务供页面，
  功能/插件/会话/配置/API Key **完全联通、实时同步**；
- 两边**可来回切换**：桌面聊一半去浏览器接着聊，反之亦然，数据只有一份；
- 区别只在**外壳**：桌面端多了原生窗口 + 鲸鱼图标 + 托盘常驻 + 开机自启，浏览器端就是个标签页。
  内核能力完全相同，**没有任何阉割**。

> 用户那套「自己的框架界面」就是 dsh 内核提供的完整界面，桌面版只是给它套了个原生窗口。

## 工作方式

```
KK Go.exe
  ├─ 单实例互斥（重复启动 → 通知托盘实例打开窗口/退出）
  ├─ 确保数据目录（DSH_HOME，默认非 C 盘）下的 profiles\web 存在（缺失时从内置模板复制）
  ├─ 若 127.0.0.1:18632 已有服务 → 直接接管
  ├─ 否则后台启动 runtime\node.exe app\dsh\lib\bin.js --profile web --port 18632
  │     （日志 → desktop.log 轮转, PID → desktop.pid）
  ├─ 等待服务就绪（最多 150 秒）→ 消息循环启动后弹出原生 WebView2 窗口（鲸鱼图标）
  └─ 托盘常驻：监护进程、重启/停止服务、开机自启开关、退出

KK Go.exe stop  → 停止服务并退出托盘（开始菜单快捷方式）
KK Go.exe --startup → 开机自启模式（只起服务+托盘，不弹窗口）
KK Go.exe --shutdown → 彻底关闭（杀托盘主进程 + dsh 服务整棵进程树；卸载器在删文件前调用）
```

> **`--shutdown` 为什么必须有**：dsh 服务是独立的 `node.exe` 子进程，会一直持有
> `<安装目录>\runtime\node.exe` 的文件句柄。不先杀掉它，Inno 卸载时就删不掉这个
> 93MB 的核心文件，用户看到的"卸载"就变成"卸载一半"。安装器的 `[UninstallRun]`
> 会在删文件前调用 `--shutdown`，配合 `[Setup] CloseApplications=yes` 双保险。

用户数据（会话、配置、API 密钥）保存在**数据目录**（`DSH_HOME`，默认放**非 C 盘**的 `KK Go Data`，可托盘右键「更改数据目录」改到任意盘），卸载不删除。
日志 / PID 放安装目录下 `.kkgo\`（`desktop.log` / `desktop.pid`）。

## KK Go 品牌层（与上游 dsh 的辨识度）

| 位置 | 作用 |
|---|---|
| `runtime/kkgo-brand/` | 自研客户端插件 `@deepseek-ai/dsh-client-ui-brand-kkgo`，通过 `sidebar.brand.mark` / `sidebar.brand.name` 两个插槽渲染「渐变 KK 徽标 + KK Go 字样」 |
| `runtime/profiles/kkgo.patch.yml` | profile overlay：禁用上游 `ui-brand-official`，插入 KK Go 品牌插件 |
| `scripts/verify_brand.py` | **品牌运行时闸门**：真起服务 → 断言 stdout 无 `did not activate` / `ERR_MODULE_NOT_FOUND` → 抓真正下发给浏览器的 HTML → 断言 boot 清单含 `ui-brand-kkgo`、不含 `ui-brand-official`、`<title>KK Go</title>`。闸门不过，构建直接失败 |
| `build.ps1` 第 4 步 | 把品牌包登记进 `app/dsh/package.json` 的 `dependencies`（**必须**——否则 dsh 的包解析双域机制收不到它，浏览器侧直接 `ERR_MODULE_NOT_FOUND`） |

> **浏览器侧 factory 必须是 CommonJS 包装**：官方写法是
> `var module={exports:{}}; var exports=module.exports;` +
> `Object.defineProperty(exports, Symbol.toStringTag, {value:'Module'})`。
> 直接写裸 ESM 会抛 `exports is not defined`，整个侧边栏品牌区空白。

## WebView2 用户数据目录

`CoreWebView2Environment.CreateAsync(null, %LOCALAPPDATA%\KK Go\WebView2, null)` —— **必须显式指定**。
不指定时 WebView2 默认写在**可执行文件同级目录**（`<安装目录>\KK Go.exe.WebView2`），
后果有三：卸载后残留一整个浏览器缓存目录；装到 Program Files 时没有写权限导致 WebView2 起不来；
和程序文件混在一起，升级时被当成程序文件一起搬走。

## 重新构建

一键构建（需要网络，用于下载 Node 运行时与 Inno Setup 编译器）：

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

分步命令（手动流程）：
1. 图标：`$env:NODE_PATH=<dsh 的 node_modules>; node scripts\make-icon.cjs`
   （生成 `icon\whale.ico`，并复制到 `app\whale.ico` 供托盘使用）
2. 运行时：下载 `https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip`，
   把 `node.exe` 与 `LICENSE` 放入 `app\runtime\`
3. dsh 包：`robocopy <全局 dsh 安装目录> app\dsh /E /XF *.map /XD darwin-arm64 darwin-x64 win32-arm64 linux-x64 linux-arm64 .cache .git`
4. 启动器 + 客户端窗口：`csc /nologo /target:winexe /optimize+ /platform:x64 /codepage:65001
   /win32icon:icon\whale.ico /out:"app\KK Go.exe"
   /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll
   /r:"app\Microsoft.Web.WebView2.Core.dll" /r:"app\Microsoft.Web.WebView2.WinForms.dll"
   scripts\Launcher.cs scripts\DshClient.cs`
   （WebView2 SDK 从 NuGet 的 `Microsoft.Web.WebView2` 包提取 net462 三个 DLL 放入 app 根目录）
5. 安装包：`ISCC.exe installer\installer.iss`（Inno Setup 6.7+，需 ChineseSimplified.isl）
6. **数字签名（正式发布前）**：见 `app\docs\数字签名指南.md` —— 先签
   `KK Go.exe` 再编译安装包，最后签安装包

## 版本与注意事项

- 桌面版版本 **3.1.5**（内置 `@deepseek-ai/dsh` **0.2.2-rc.5** + 10个内置插件 + KK Go 品牌插件），Node 运行时 **v24.22.1**
  - **v3.1.5 修复**：服务起不来 / 界面 HTTP ERROR 404；同时修正版本号漂移，「关于 KK Go」与安装包、文档全部统一显示 3.1.5。
  - **v3.1.4 紧急修复**：① 数据目录必须用绝对路径（`D:KK Go Data` 这种驱动器相对路径会让 WebView2 弹「无法创建数据目录」、窗口直接废掉）；② 覆盖升级优先复用已有数据目录，不丢凭据/会话；③ 安装包本体补上官方鲸鱼图标（`SetupIconFile`）。从 3.1.3 直接覆盖安装即可，无需卸载。
  - **内核版本可自由指定/升级**：不与任何端硬绑定。默认 `0.2.2-rc.5`，可通过命令行 `-DshVer`、环境变量 `DSH_VER` 或 `build.config.json` 的 `dshVer` 任意指定/升级
  - build.ps1 会按指定版本 `npm install @deepseek-ai/dsh@<版本>` 固定内核，不依赖构建机全局 npm 版本；版本号不符会直接报错停止
  - Node 版本同样可配（`-NodeVer` / 环境变量 `NODE_VER` / `build.config.json`），默认 v24.22.1；原生模块 ABI 需与所选内核匹配，勿随意更换
- 仅支持 **Windows 10/11 x64**（安装器已限制 `x64compatible` + `MinVersion=10.0`），
  无需管理员权限
- 客户端窗口需 WebView2 运行时（Win10/11 自带或随 Edge 安装），缺失时自动回退浏览器
- 安装包已做代码签名（自签证书 `KK Go Code Signing`，`sign.ps1` 自动生成），
  本机 SmartScreen 可识别；**跨机首次安装仍可能提示"未知发布者"，点"仍要运行"即可**
  （自签 CA 不在系统信任库中；彻底消除需商业 OV/EV 证书 + 下载信誉积累，详见 `app\docs\数字签名指南.md`）
- 端口默认 **18632**（客户端专用，避开 dsh 的 3080），可用环境变量 `DSH_PORT` 覆盖
- 测试环境变量：`DSH_NO_OPEN=1` 让启动器不弹客户端窗口（自动化验证用）

## 命令行/PWA 版启动（非桌面安装包）

如果你使用的是 Edge PWA 快捷方式或浏览器访问 `http://127.0.0.1:3080`，请用本包附带的：

```batch
start-dsh-3080.bat
```

或手动执行：

```batch
dsh web --host 127.0.0.1 --port 3080
```

**不要执行 `npx @deepseek-ai/dsh web`**。npx 会在临时目录解析 dsh，无法找到全局安装时已经配置好的 profile 与插件，从而报 `cannot resolve profile bundle` 错误。
