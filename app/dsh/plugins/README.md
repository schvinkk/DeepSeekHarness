# DeepSeek Harness Plugin Suite v2.95.27

## 🎯 15个插件完整功能

DeepSeek Harness 2.95.27 版本集成了 15 个强大的插件，对标 Codex、WorkBuddy、千问办公和 Claude Code。

---

## 📦 插件列表

### 🌐 核心插件 (5个)

| 插件 | 功能 | 用途 |
|------|------|------|
| **Chrome** | 浏览器控制 | 打开网页、搜索信息、填写表单、测试网站 |
| **GitHub** | 代码仓库管理 | 查看仓库、提交PR、处理Issue、Review代码 |
| **Computer Use** | 桌面控制 | 直接操作电脑软件和窗口，相当于AI有了"双手" |
| **Build Web Apps** | 网页应用生成 | 一句话生成Landing Page、管理后台、SaaS MVP |
| **Figma** | 设计转代码 | 理解Figma设计稿并生成对应代码 |

### 📄 办公插件 (3个)

| 插件 | 功能 | 用途 |
|------|------|------|
| **Documents** | 文档生成 | PRD、方案书、会议纪要、项目总结、周报月报 |
| **Presentations** | PPT生成 | 输入主题自动生成完整演示文稿 |
| **Spreadsheets** | 数据分析 | 自动分析数据、生成图表、输出报表 |

### 🎬 媒体插件 (4个)

| 插件 | 功能 | 用途 |
|------|------|------|
| **HyperFrames** | 网页转视频 | 把网页/产品页面转换成演示视频 |
| **Remotion** | 程序化视频 | 通过代码批量生成视频内容 |
| **Vision AI** | 视觉分析 | 图像识别、OCR文字提取、物体检测 |
| **File Upload** | 文件上传 | 上传图片、文档、任何文件类型 |

### 🔌 集成插件 (3个)

| 插件 | 功能 | 用途 |
|------|------|------|
| **MCP Marketplace** | MCP服务器市场 | 发现和安装MCP服务器 |
| **Skill Market** | 技能市场 | 发现和使用Agent技能 |
| **Context Compression** | 上下文压缩 | 上下文满时自动压缩继续处理 |

---

## 🚀 快速开始

### 安装插件

```bash
# 插件已内置，无需单独安装
# 启动 DeepSeek Harness 即可使用所有插件
```

### 使用示例

#### Chrome 插件
```
帮我打开百度搜索"DeepSeek Harness"
```

#### GitHub 插件
```
查看我的GitHub仓库列表
```

#### Build Web Apps 插件
```
帮我生成一个SaaS产品的落地页
```

#### Documents 插件
```
生成一份产品需求文档(PRD)
```

#### Presentations 插件
```
为"AI助手产品介绍"生成PPT
```

#### Spreadsheets 插件
```
分析这个CSV文件并生成图表
```

#### Vision AI 插件
```
识别这张图片中的文字
```

#### Context Compression 插件
```
# 自动工作 - 当上下文满时自动压缩
```

---

## 🔧 MCP 服务器市场

内置热门MCP服务器：

- **Filesystem** - 文件系统操作
- **GitHub** - GitHub API集成
- **PostgreSQL** - 数据库查询
- **Brave Search** - 网页搜索
- **Google Maps** - 地图服务
- **Memory** - 持久化记忆
- **Slack** - Slack集成
- **Notion** - Notion集成

---

## 🎯 技能市场

内置Agent技能：

- **Web Search** - 网页搜索
- **Code Review** - 代码审查
- **Data Analysis** - 数据分析
- **Content Writing** - 内容写作
- **Image Generation** - 图像生成
- **Translation** - 翻译
- **API Design** - API设计
- **Database Design** - 数据库设计
- **Testing** - 测试
- **DevOps** - DevOps
- **Security Audit** - 安全审计
- **Performance Optimization** - 性能优化

---

## 📊 技术特性

### 上下文压缩

当对话上下文接近满时，系统会自动：

1. 分析消息重要性
2. 保留关键信息
3. 压缩或总结旧消息
4. 确保对话可以继续

压缩策略：
- **Smart** - 智能压缩（默认）
- **Aggressive** - 激进压缩
- **Preserve Recent** - 保留最近消息
- **Summarize All** - 总结所有消息

### 文件上传

支持的文件类型：
- **图片**: JPG, PNG, GIF, WebP, SVG, BMP, TIFF
- **文档**: PDF, Word, Excel, PowerPoint, TXT, CSV, MD
- **代码**: JavaScript, JSON, XML, TypeScript, Python
- **压缩包**: ZIP, RAR, 7Z
- **媒体**: MP3, WAV, MP4, WebM

上传方式：
- 拖拽上传
- 剪贴板粘贴
- 文件选择器

---

## 🏆 对标产品

| 功能 | DeepSeek Harness | Codex | WorkBuddy | 千问办公 | Claude Code |
|------|------------------|-------|-----------|----------|-------------|
| 浏览器控制 | ✅ Chrome插件 | ✅ | ✅ | ❌ | ❌ |
| GitHub集成 | ✅ GitHub插件 | ✅ | ✅ | ❌ | ✅ |
| 桌面控制 | ✅ Computer Use | ✅ | ❌ | ❌ | ❌ |
| 网页生成 | ✅ Build Web Apps | ✅ | ✅ | ✅ | ✅ |
| 设计转码 | ✅ Figma插件 | ✅ | ❌ | ❌ | ❌ |
| 文档生成 | ✅ Documents | ✅ | ✅ | ✅ | ✅ |
| PPT生成 | ✅ Presentations | ❌ | ✅ | ✅ | ❌ |
| 数据分析 | ✅ Spreadsheets | ✅ | ✅ | ✅ | ✅ |
| 视频生成 | ✅ HyperFrames+Remotion | ❌ | ❌ | ❌ | ❌ |
| 视觉识别 | ✅ Vision AI | ✅ | ❌ | ✅ | ✅ |
| MCP市场 | ✅ MCP Marketplace | ❌ | ❌ | ❌ | ❌ |
| 技能市场 | ✅ Skill Market | ❌ | ❌ | ❌ | ❌ |
| 上下文压缩 | ✅ Context Compression | ✅ | ✅ | ✅ | ✅ |

---

## 📝 版本信息

- **版本**: 2.95.27
- **插件数量**: 15个
- **支持平台**: Windows 10/11 x64
- **Node运行时**: v26.7.0
- **发布日期**: 2025年8月

---

## 🛠️ 开发者信息

### 插件开发

每个插件都是独立的模块，位于 `plugins/` 目录：

```
plugins/
├── chrome/           # Chrome浏览器控制
├── github/           # GitHub集成
├── computer-use/     # 桌面控制
├── build-web-apps/   # 网页应用生成
├── figma/            # Figma设计转码
├── documents/        # 文档生成
├── presentations/    # PPT生成
├── spreadsheets/     # 数据分析
├── hyperframes/      # 网页转视频
├── remotion/         # 程序化视频
├── vision-ai/        # 视觉AI
├── file-upload/      # 文件上传
├── mcp-marketplace/  # MCP市场
├── skill-market/     # 技能市场
├── context-compression/ # 上下文压缩
└── index.js          # 插件注册中心
```

### 添加新插件

1. 在 `plugins/` 目录创建新文件夹
2. 创建 `package.json` 和 `lib/index.js`
3. 在 `index.js` 中注册插件
4. 更新 `profiles/web/package.json`

---

## 📞 支持

- **GitHub**: https://github.com/deepseek-ai/deepseek-harness
- **文档**: https://docs.deepseek.com/harness
- **问题反馈**: https://github.com/deepseek-ai/deepseek-harness/issues

---

## 📄 许可证

MIT License - 详见 LICENSE 文件

---

**DeepSeek Harness Team** | 2025年8月
