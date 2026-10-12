# Dinotty Agent-Cache Plugin

Dinotty 终端专用的 AI 状态栏与缓存监控插件。

## 功能特性
- **实时状态栏指标**：在 Dinotty 终端底部状态栏展示 `⚡ Cache XX% (XXk)`。
- **60 秒走势折线图**：点击状态栏图标即可查看过去 60 秒的缓存命中率趋势。
- **交互明细弹窗**：实时展示当前模型名称、Token 消耗（输入/输出/已命中缓存）、上下文容量进度、生成速率（TPS）及最近更新时间。
- **免重启热加载**：基于 Dinotty 插件系统动态导入，改动即时生效。

## 安装方式
复制 `agent-cache` 文件夹至 `%USERPROFILE%\.dinotty\plugins\agent-cache`（Linux/macOS 为 `~/.dinotty/plugins/agent-cache`），Dinotty 会自动检测并挂载。
