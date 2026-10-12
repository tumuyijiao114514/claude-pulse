# ⚡ Claude Pulse

<p align="center">
  <b>Universal Multi-Protocol Statusline, Intelligent Context Self-Learning, Windows Terminal & Shell Aesthetics Suite for Claude Code</b><br>
  <i>全协议通用缓存监控 · 模型上下文自学习 · Windows Terminal 东京夜亚克力美化 · Dinotty 终端原生插件系统</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.1.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Windows%20Terminal-Tokyo%20Night%20Acrylic-1abc9c?style=flat-square" alt="Windows Terminal">
  <img src="https://img.shields.io/badge/Dinotty-Plugin%20Ready-F59E0B?style=flat-square" alt="Dinotty">
  <img src="https://img.shields.io/badge/CC%20Switch-Protected-10B981?style=flat-square" alt="CC Switch">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License">
</p>

---

## 📖 简介 / Overview

**Claude Pulse** 是一套专为 **Claude Code CLI** 与现代开发终端打造的**全能状态栏、AI 遥测与终端美化套件**。

无论你使用的是 Anthropic 原生 Claude 模型，还是通过 **CC Switch / 聚合网关** 接入的 **DeepSeek、GPT、GLM、Gemini** 等第三方模型，Claude Pulse 都能精准捕获缓存命中率、自动学习模型上下文上限，并将数据实时同步至外部终端。

同时，**v1.1.0** 全新集成了 **Windows Terminal 东京夜亚克力磨砂（Tokyo Night Acrylic）**、**Cascadia Code 编程连字** 与 **极速双行 Shell 提示符**，让你的开发环境**既拥有极致的丝滑性能，又兼备好莱坞级的黑客颜值**。

```text
 ~/Desktop/claude-pulse (main)
 ❯ claude

 📦 DeepSeek 4.1 Flash │ Ctx [■■■■□□□□] 56.6% (72.5k/128k) │ 💾 Cache 96% (64.8k) │ ⚡ 1.5 TPS │ 📁 main
```

*(Dinotty 终端右下角状态栏同步点亮)*:
```text
 [⚡ Cache 96% (64.8k)]  ── 点击展示 60s 走势折线图与 Token 消耗明细
```

---

## 🌟 核心特性 / Features

### 1. 🎨 Windows Terminal 终极美化 (Tokyo Night Acrylic & Fonts)
- **东京夜亚克力毛玻璃（Tokyo Night Acrylic 88%）**：开启 Windows 11 原生 Fluent 亚克力深邃透光特效，预置 **Tokyo Night** 与 **Catppuccin Mocha** 两大顶级配色；
- **Cascadia Code 编程连字符（Ligatures）**：自动合并 `=>`、`!=`、`===`、`->` 等常用逻辑符号为数学连字符，排版极具美感；
- **极速纯原生 Shell 提示符**：自动缩短主目录路径为 `~`，检测 Git 仓库自动以紫光显示分支 `(main)`，纯原生 0.1ms 极速响应，绝不拖慢终端回车；
- **极度跟手交互**：开启 **鼠标划选自动复制**（`copyOnSelect: true`）与 **右键单击即粘贴**。

### 2. ⚡ 全协议缓存命中率引擎 (Multi-Protocol Cache Engine)
彻底解决传统状态栏插件（如 `ccstatusline`）在非 Anthropic 模型下显示破损横杠 `💾 Cache —` 的通病。全面兼容：
- **Anthropic 官方协议**：`cache_read_input_tokens` / `cache_creation_input_tokens`
- **OpenAI Chat Completions 协议**：`prompt_tokens_details.cached_tokens`
- **OpenAI Responses 协议**：`input_tokens_details.cached_tokens`
- **Google Gemini 原生协议**：`cachedContentTokenCount`
- **DeepSeek Context Cache 协议**：精准折算 90% 缓存折扣收益与节省 Token

### 3. 🧠 四级上下文智能自学习 (Universal Context Self-Learning)
无需手动配置模型参数，未来任何新发布模型均可自动适配：
1. **显式容量声明**：优先继承 CC Switch 等网关的“声明支持 1M/2M”定义；
2. **本地模型库反查**：自动扫描本机的 CC Switch 与 Codex 模型库索引；
3. **命名规则动态萃取**：自动从模型后缀识别 `-128k`、`-256k`、`-1m`、`-4m`；
4. **自适应溢出阶梯**：当实际消耗超过预估时，按业界标准硬件阶梯（16k/32k/64k/128k/256k/512k/1M/2M/4M/10M）无感平滑向上扩展，永不爆条（`>100%`），并持久化记忆至 `model_context_cache.json`。

### 4. 🖥️ Dinotty 终端原生插件 (Native Dinotty Plugin)
- 完美契合新一代跨平台终端 **Dinotty** 的插件系统；
- 底部状态栏原生展示 `⚡ Cache XX% (XXk)`；
- 点击弹出 **60 秒实时趋势折线图** 与包含输入、输出、缓存量、模型、TPS、更新时长的精致看板。

### 5. 🛡️ CC Switch 防冲刷保护 (CC Switch Lockdown)
内置专门的 SQLite 配置维护脚本，自动为 CC Switch 中的全部 Claude 供应商注入状态栏保护，即使在 CC Switch 界面中频繁切换通道，也**绝不丢失状态栏配置**。

### 6. 🚀 零依赖 · 亚毫秒极速响应 (Zero-Dependency & Sub-millisecond)
- 100% 采用 Node.js 原生标准库，无臃肿的 `node_modules` 负担；
- 执行耗时小于 5ms，全流程静默容错保护，任何异常均平稳退化，永不阻断 Claude Code 主流程。

---

## 📂 项目结构 / Structure

```text
claude-pulse/
├── install.ps1                 # Windows 一键全自动综合安装脚本 (PowerShell)
├── install.sh                  # macOS / Linux 一键自动安装脚本 (Bash)
├── package.json                # 项目元数据与便捷命令
├── LICENSE                     # MIT 开源协议
├── scripts/
│   ├── statusline.cjs          # 状态栏核心引擎 (多协议提取 + 自学习上下文 + 实时遥测)
│   ├── setup-terminal.ps1      # Windows Terminal 亚克力美化与 Shell 提示符独立配置脚本
│   └── patch-ccswitch.py       # CC Switch 供应商配置自动锁定脚本
└── dinotty-plugin/
    └── agent-cache/            # Dinotty 终端原生插件
        ├── plugin.json         # 插件清单
        ├── main.js             # 响应式状态管理 + 状态栏 Series + Popover 走势图
        └── README.md
```

---

## 🚀 快速开始 / Quick Start

### 方式一：Windows 一键全自动配置 (推荐 ⭐⭐⭐⭐⭐)

打开 PowerShell 执行一行命令即可自动完成所有配置：

```powershell
git clone https://github.com/tumuyijiao114514/claude-pulse.git
cd claude-pulse
.\install.ps1
```

> **`install.ps1` 会自动为您完成**：
> 1. ✅ 检测 Node.js 运行时环境；
> 2. ✅ 将状态栏引擎安装至 `~/.claude/statusline.cjs`；
> 3. ✅ 更新 `~/.claude/settings.json` 的 `statusLine` 配置；
> 4. ✅ 若检测到 Dinotty 终端，自动部署 `agent-cache` 插件；
> 5. ✅ 若检测到 CC Switch，自动批量注入保护各渠道配置；
> 6. ✅ **自动美化 Windows Terminal**（注入 Tokyo Night、开启 88% 亚克力磨砂、启用 Cascadia Code 连字、开启划选自动复制）；
> 7. ✅ **自动升级 PowerShell Profile**（配置轻量双行提示符与免权限审查启动别名）。

---

### 方式二：仅升级 Windows Terminal 美化与 Shell

如果您只需要美化 Windows Terminal 和 PowerShell 提示符：

```powershell
npm run setup:terminal
# 或者直接运行:
powershell -ExecutionPolicy Bypass -File .\scripts\setup-terminal.ps1
```

---

### 方式三：macOS / Linux 一键安装

在终端执行：

```bash
chmod +x ./install.sh
./install.sh
```

---

## 📊 遥测数据流 / Architecture

```mermaid
flowchart LR
    A[Claude Code CLI] -->|输出 Token & 成本| B[statusline.cjs]
    B -->|渲染 ANSI 彩色文本| C[Windows Terminal / 控制台底部]
    B -->|智能学习模型上限| D[model_context_cache.json]
    B -->|原子写入遥测数据| E[cache_stats.json]
    E -->|每秒异步采样| F[Dinotty agent-cache 插件]
    F -->|点亮右下角指标| G[Dinotty 状态栏与 60s 折线看板]
```

---

## 🛠️ 常见问题 / FAQ

#### Q: 为什么我在第三方模型（如 DeepSeek）下也可以看到缓存命中率？
A: 标准的 Claude 状态栏插件只认 `cache_read_input_tokens` 字段，而第三方中转和 OpenAI 兼容接口会将缓存数据放在 `prompt_tokens_details.cached_tokens` 中。Claude Pulse 内部实现了全协议聚合器，抹平了各供应商之间的字段差异。

#### Q: 切换模型后上下文长度不对怎么办？
A: Claude Pulse 会自动分析模型名称并在对话产生后自学习。如果模型名称非常特殊（未携带 128k/1M 等字样），系统会在 Token 增长时自动沿阶梯无感扩展，并把学到的结果保存在 `~/.claude/model_context_cache.json` 中，越用越准。

#### Q: 在 CC Switch 切换渠道后，状态栏会丢失吗？
A: 不会。通过运行 `python scripts/patch-ccswitch.py`，所有 Claude 渠道的配置已被永久锁定挂载本脚本。

#### Q: Windows Terminal 亚克力效果没有出现？
A: 请确保您的 Windows 系统开启了“设置 -> 辅助功能 / 个性化 -> 视觉效果 -> 透明效果”。Windows Terminal 依赖该系统全局开关生效。

---

## 📄 开源许可证 / License

本项目采用 [MIT License](LICENSE) 开源协议。欢迎 Fork、Star 和提交 PR！
