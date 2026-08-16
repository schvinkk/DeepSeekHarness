# DeepSeekHarness 桌面客户端（非官方第三方打包）

> 这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的 **Windows 桌面客户端安装包打包工程**。将官方命令行工具封装为普通用户可直接双击安装、长期托盘常驻的原生桌面应用。
>
> ⚠️ **本仓库及安装包为社区第三方作品，与 DeepSeek 官方无关。版权与商标归属 DeepSeek，详见 [DISCLAIMER.md](./DISCLAIMER.md)。**

---

## 版本

- **当前源码版本：v2.95.27**（新增 15 插件系统）
- 分支：`main` 即 v2.95.27 源码

## 功能特性

- **一键安装**：无需 Node.js、无需命令行，双击 `.exe` 按向导完成；
- **原生桌面窗口**：系统 WebView2 内核，统一黑色鲸鱼图标，无浏览器外壳；
- **托盘常驻**：启动后右下角托盘常驻，支持打开/重启/停止服务、开机自启；
- **开机自启**：安装时可选，也可在托盘随时开关（写入 HKCU，卸载自动清理）；
- **独立端口**：默认 `127.0.0.1:18632`，与 dsh CLI 的 3080 不冲突；
- **单实例守护**：重复点击不重复启动，异常退出可一键重启；
- **数据持久化**：会话、配置、API Key 保存在 `%USERPROFILE%\.dsh`，卸载不删除；
- **日志轮转**：`%USERPROFILE%\.dsh\desktop.log` 超 1MB 自动轮转。

## 插件系统（v2.95.27 新增）

v2.95.27 集成了 **15 个内置插件**，对标 Codex / WorkBuddy / 千问办公 / Claude Code。插件源码位于 [`app/dsh/plugins/`](./app/dsh/plugins/)，完整说明见 [`app/dsh/plugins/README.md`](./app/dsh/plugins/README.md)。

| 类别 | 插件 | 功能 |
|------|------|------|
| 核心 | 🌐 Chrome | 浏览器控制：打开网页、搜索、填表、测试站点 |
| 核心 | 💻 GitHub | 仓库管理：查看仓库、提交 PR、处理 Issue、Review |
| 核心 | 🖥️ Computer Use | 桌面控制：直接操作软件与窗口 |
| 核心 | 🚀 Build Web Apps | 一句话生成 Landing Page / 管理后台 / SaaS MVP |
| 核心 | 🎨 Figma | 设计稿转代码 |
| 办公 | 📄 Documents | 生成 PRD、方案书、会议纪要、周报 |
| 办公 | 📊 Presentations | 自动生成 PPT |
| 办公 | 📈 Spreadsheets | 数据分析、图表、报表 |
| 媒体 | 🎬 HyperFrames | 网页转演示视频 |
| 媒体 | ⚡ Remotion | 代码批量生成视频 |
| 媒体 | 👁️ Vision AI | 图像识别、OCR、物体检测 |
| 媒体 | 📎 File Upload | 拖拽/粘贴/选择器上传任意文件 |
| 集成 | 🔌 MCP Marketplace | 发现安装 8 个热门 MCP 服务器 |
| 集成 | 🎯 Skill Market | 发现使用 12 个 Agent 技能 |
| 集成 | 🗜️ Context Compression | 上下文满时自动压缩，任务继续执行 |

> 插件通过 `app/profiles/web/package.json` 的 `file:../../plugins/*` 引用并打包，开发者可在 `app/dsh/plugins/` 下按 `package.json` + `lib/index.js` 规范新增插件。

## 快速下载

Windows 安装包通过 [Releases](https://github.com/schvinkk/DeepSeekHarness/releases) 页面发布。

- **源码已升级至 v2.95.27（含 15 插件）**；
- 若需 **v2.95.27 安装包**：在本机运行 `build.ps1` 生成 `dist/DeepSeekHarness-Setup-2.95.27.exe`，或等待 Release 更新安装包；
- 当前 Release 仍提供 v1.95.27 安装包供下载（功能较旧，不含插件系统）。

## 系统要求

- Windows 10 / Windows 11 64 位
- 已安装或随 Edge 自带的 WebView2 运行时（缺失时自动回退浏览器）
- 无需管理员权限（默认安装到用户目录）

## 安装与使用

1. 从 Releases 下载最新安装包（或自行 `build.ps1` 生成）；
2. 双击运行，若 SmartScreen 提示"未知发布者"，点击"更多信息 → 仍要运行"；
3. 按向导选择安装目录（默认无需管理员），可选创建桌面快捷方式、开机自启；
4. 安装完成后点击"立即启动"，稍候弹出客户端窗口；
5. 进入左侧**设置 → 模型**，填入你的 DeepSeek / OpenAI 兼容 API Key，选择模型即可使用。

详细说明见 [`app/docs/使用说明.md`](./app/docs/使用说明.md)。

## 重新构建

如果你希望从源码重新编译安装包（**Windows 环境**，需 .NET Framework 的 `csc`、Inno Setup、WebView2 SDK，构建脚本会自动下载便携版）：

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

构建脚本会自动下载：
- Node.js v26.7.0 便携运行时
- WebView2 SDK（NuGet 包）
- Inno Setup 6.7 便携编译器

> 构建脚本默认从全局 npm 安装目录复制 `@deepseek-ai/dsh`；如果未全局安装，脚本会尝试通过 npm 自动下载该包。详见脚本内 `$DSH_SRC` 配置。

## 目录结构

```
DeepSeekHarness/
├── app/docs/               # 使用说明、数字签名指南
├── app/dsh/               # dsh 包（源码，不含 node_modules/lib/config/runtime 等构建产物）
│   ├── package.json       # dsh 清单（v2.95.27，files 含 plugins）
│   └── plugins/           # 15 个插件源码（v2.95.27 新增）
├── app/profiles/web/       # dsh web profile 模板（集成全部插件）
├── icon/                   # 鲸鱼图标（多尺寸）
├── installer/              # Inno Setup 安装脚本
├── scripts/                # C# 启动器 + 图标生成脚本
├── build.ps1               # 一键打包脚本
├── DISCLAIMER.md           # 免责声明
├── LICENSE                 # 本打包工程的 MIT 许可证
└── README.md               # 本文件
```

## 安全与签名

当前安装包**未做代码签名**，Windows Defender / SmartScreen 可能提示"未知发布者"。签名步骤见 [`app/docs/数字签名指南.md`](./app/docs/数字签名指南.md)。

## 免责声明

**本项目不是 DeepSeek 官方产品**。DeepSeek、DeepSeek Harness、鲸鱼 Logo 等知识产权归 DeepSeek 及其关联公司所有。本仓库仅提供安装包打包源码与构建脚本，按"原样"提供，不提供任何明示或暗示担保。

下载、安装或使用本安装包所产生的任何风险由用户自行承担。建议优先使用 DeepSeek 官方发布的版本与渠道。

完整法律声明见 [`DISCLAIMER.md`](./DISCLAIMER.md)。

## 版权与许可证

- 本仓库中的**打包脚本、启动器源码、安装脚本、文档、以及 `app/dsh/plugins/` 下新增的 15 插件**采用 [MIT License](./LICENSE)。
- 内置的 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) 及其依赖的版权与许可证归原项目方所有。
- Node.js 运行时、WebView2 SDK、Inno Setup 等第三方组件的版权与许可证归各自所有者。

## 致谢

- 核心功能来自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- 黑色鲸鱼图标来自 dsh 官方前端 favicon
