# DeepSeek Harness 桌面版 — 打包工程

把 DeepSeek Harness（`@deepseek-ai/dsh`）封装成**普通用户可直接安装使用的
Windows 桌面客户端安装包**：安装包自带 Node.js 运行时与全部依赖，无需用户安装
任何开发环境；黑色鲸鱼原图标来自 dsh 官方前端 favicon。

## 功能特性

- **桌面客户端（原生窗口）**：双击图标启动本地服务并弹出**原生客户端窗口**
  （系统 WebView2 内核，无浏览器外壳），窗口与任务栏**统一黑色鲸鱼图标**；
  WebView2 运行时缺失时回退到带鲸鱼图标的 Edge 应用窗口 / 默认浏览器
- **托盘常驻**：启动后系统托盘常驻黑色鲸鱼图标 —— 打开 / 重启服务 /
  停止服务释放内存 / 开机自启开关 / 退出
- **开机自启**：安装时可勾选，或托盘菜单随时开关（写入 HKCU 启动项，卸载自动清理）
- **自定义安装目录**：安装向导可自由选择目录（默认用户目录，无需管理员权限）
- **单实例守护**：重复点击不产生多进程；服务异常退出时托盘提示并可一键重启
- **专用端口 18632**：与 dsh 命令行版/harness 的 3080 隔离，同机共存不冲突
- **日志轮转**：`%USERPROFILE%\.dsh\desktop.log` 超 1MB 自动轮转，不占磁盘
- **性能友好**：托盘进程 BelowNormal 优先级不抢资源；常驻内存约 175MB；
  冷启动约 5–10s、热启动 3–6s、常驻后客户端**秒开**

## 交付物

| 文件 | 说明 |
|---|---|
| `dist\DeepSeekHarness-Setup-2.95.27.exe` | **最终安装包**（约 50MB），发给用户直接安装 |
| `start-dsh-3080.bat` | 命令行/PWA 版启动脚本：用**全局 `dsh web`** 启动 3080 端口，避免 `npx` 导致的 profile bundle 解析失败 |
| `app\DeepSeek Harness.exe` | 托盘启动器 + 原生客户端窗口（无参=启动并打开窗口；`--startup`=静默常驻；`stop`=停止） |
| `app\Microsoft.Web.WebView2.*.dll` + `WebView2Loader.dll` | WebView2 SDK（承载原生窗口，随包分发） |
| `app\runtime\node.exe` | 内置 Node.js v26.7.0 便携运行时（随包分发） |
| `app\dsh\` | `@deepseek-ai/dsh` 完整包 + 全部依赖（已裁剪 sourcemap 与非 Windows 预编译模块） |
| `app\profiles\web\` | web profile 模板（首次启动自动复制到用户数据目录） |
| `app\docs\` | 使用说明.md、数字签名指南.md（随安装包分发） |
| `icon\whale.ico` | 多尺寸（16–256px）黑色鲸鱼图标 |
| `installer\installer.iss` | Inno Setup 安装脚本（中文向导、自定义目录、开机自启选项、卸载程序） |

## 工作方式

```
DeepSeek Harness.exe
  ├─ 单实例互斥（重复启动 → 通知托盘实例打开窗口/退出）
  ├─ 确保 %USERPROFILE%\.dsh\profiles\web 存在（缺失时从内置模板复制）
  ├─ 若 127.0.0.1:18632 已有服务 → 直接接管
  ├─ 否则后台启动 runtime\node.exe app\dsh\lib\bin.js --profile web --port 18632
  │     （日志 → desktop.log 轮转, PID → desktop.pid）
  ├─ 等待服务就绪（最多 150 秒）→ 消息循环启动后弹出原生 WebView2 窗口（鲸鱼图标）
  └─ 托盘常驻：监护进程、重启/停止服务、开机自启开关、退出

DeepSeek Harness.exe stop  → 停止服务并退出托盘（开始菜单快捷方式）
DeepSeek Harness.exe --startup → 开机自启模式（只起服务+托盘，不弹窗口）
```

用户数据（会话、配置、API 密钥）保存在 `%USERPROFILE%\.dsh`，卸载不删除。

## 重新构建

一键构建（需要网络，用于下载 Node 运行时与 Inno Setup 编译器）：

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

分步命令（手动流程）：
1. 图标：`$env:NODE_PATH=<dsh 的 node_modules>; node scripts\make-icon.cjs`
   （生成 `icon\whale.ico`，并复制到 `app\whale.ico` 供托盘使用）
2. 运行时：下载 `https://nodejs.org/dist/v26.7.0/node-v26.7.0-win-x64.zip`，
   把 `node.exe` 与 `LICENSE` 放入 `app\runtime\`
3. dsh 包：`robocopy <全局 dsh 安装目录> app\dsh /E /XF *.map /XD darwin-arm64 darwin-x64 win32-arm64 linux-x64 linux-arm64 .cache .git`
4. 启动器 + 客户端窗口：`csc /nologo /target:winexe /optimize+ /platform:x64 /codepage:65001
   /win32icon:icon\whale.ico /out:"app\DeepSeek Harness.exe"
   /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll
   /r:"app\Microsoft.Web.WebView2.Core.dll" /r:"app\Microsoft.Web.WebView2.WinForms.dll"
   scripts\Launcher.cs scripts\DshClient.cs`
   （WebView2 SDK 从 NuGet 的 `Microsoft.Web.WebView2` 包提取 net462 三个 DLL 放入 app 根目录）
5. 安装包：`ISCC.exe installer\installer.iss`（Inno Setup 6.7+，需 ChineseSimplified.isl）
6. **数字签名（正式发布前）**：见 `app\docs\数字签名指南.md` —— 先签
   `DeepSeek Harness.exe` 再编译安装包，最后签安装包

## 版本与注意事项

- 桌面版版本 **2.95.27**（内置 `@deepseek-ai/dsh` 0.1.0-rc.6 + 15个插件），Node 运行时 **v26.7.0**
  （原生模块 ABI 与构建机一致，勿随意更换版本）
- 仅支持 **Windows 10/11 x64**（安装器已限制 `x64compatible` + `MinVersion=10.0`），
  无需管理员权限
- 客户端窗口需 WebView2 运行时（Win10/11 自带或随 Edge 安装），缺失时自动回退浏览器
- 安装包未做代码签名，SmartScreen 可能提示"未知发布者"——正式分发请完成签名
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
