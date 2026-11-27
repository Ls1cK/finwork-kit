## Why

FinPlus 在完成 `@lz19.02/finwork-kit` 第一阶段对接后，进一步演进了消息展示样式（轻量化可折叠 `ToolExecutionCard`、ghost 折叠面板悬停交互、中性灰度思考扫光）、命令工具生命周期归并（`TOOL_CALL_END` 与 `TOOL_RESPONSE` 回并原 `TOOL_CALL`）以及 OPC 协作模型（团长全块入轴、派发绑定 `replyId`、团员流式报告、`OpcStatus` 仅图标态、紫色角色标识与时间线页脚条目）。目前包处于 `1.0.0-beta.0`，需要以向后兼容的方式将这批稳定能力同步回 `@lz19.02/finwork-kit`，避免宿主与组件库持续分叉。

## What Changes

- **纯协议与 OPC 分组能力同步（`chat/core-sse`）**：
  - 新增命令工具识别纯函数 `getCommandToolName`（大小写不敏感匹配 `BASH`、`EXECUTE_SHELL_COMMAND`、`EXECUTE_PYTHON_CODE`），并在普通对话及递归子智能体归并中将命令工具的 `TOOL_CALL_END` / `TOOL_RESPONSE` 按 `tool_call_id || id` 合并回原 `TOOL_CALL`（新增 `inputComplete`、`responseReceived`、`stdout`、`stderr`、`returncode`、`error`，`TOOL_RESPONSE` 不覆盖已有 `delta`/`input`）。
  - 演进 `OpcToolBlock` 与 OPC 归并：`delta` 与 `input` 分离存储（同步维护 `inputComplete` 与向后兼容的 `inputEnded`），`TOOL_RESPONSE` 优先按 `tool_call_id` 匹配，大小写不敏感识别 `TEAMASSIGN` 并将派发调用 `state` 置为 `'success'`。
  - 演进 `OpcRoundState.timeline`：团长所有新增块（`THINK_MSG`、`TOOL_CALL`、`ASSISTANT_MSG`）均以 `leader` 条目入轴（保留 `blockId`），`dispatch` 条目携带 `replyId` 并仅在同 `replyId` 相邻时合并，团员 `ASSISTANT_MSG` 出现非空正文即去重追加 `report` 条目（`OPC_AGENT_REPLY_END` 兜底）。
  - 下沉纯数据展示辅助函数 `isOpcBlockStreaming` 与 `groupOpcTimeline` 至 `chat/core-sse`。
- **消息 UI 与基础样式演进（`chat/ui` & `chat/style.css`）**：
  - 新增导出 `ToolExecutionCard` 可折叠工具执行卡片组件，并将内置 `TOOL_CALL` / `TOOL_RESPONSE` 渲染（含命令工具多状态标题与失败判定、MCP 工具、`TOOL_OUTLINED` 回退）升级为该样式；保留 `ToolCallMsg` 与 `ToolCallResponse` 导出以保持向后兼容。
  - 更新 `MessageCollapse` ghost 折叠头悬停样式、`ThinkContent` 与 `TaskCompletedSplit` 间距/字号/无障碍箭头属性、`runningShine.module.less` 中性灰度思考扫光（`2s` / `110deg`），并在 `tokens.less` 新增带默认值的 `--finwork-text-title`、`--finwork-text-disabled` 与 `--finwork-purple-color` 变量。
- **OPC 协作 UI 升级（`chat/ui`）**：
  - `OpcStatus` 支持可选 `status`/`label` 与 `iconOnly` 模式（缺省状态回退 `FileSearchOutlined`）。
  - `OpcRound` / `OpcTimeline` / `OpcAnswer` 支持派发条目展示团长头像与紫色「团长」标签、任务行 `iconOnly` 状态入口、团长折叠执行过程 + 结论组合展示、团员流式多段回复、`timelineFooter` 与 `processing` 插槽，同时保持旧版 `content`、`note`、`footer` 属性兼容。
- **测试、导出校验与文档同步**：更新 `tests/core-sse.test.mjs`、`tests/core-opc.test.mjs`、`tests/message-ui.test.mjs`、`scripts/verify-exports.mjs` 及 `docs/` 参考文档与示例。
- **Non-goals（明确排除项）**：
  - 已与 FinPlus 对齐的 Markdown 预处理 / 引用锚点（`preprocess.ts`、`referenceAnchors.ts`、`MarkdownViewer`、`StreamingMarkdownRenderer`、`ReferenceAnchor`）、`core-detail` 帧扫描与 `\u` 探测、`ordinary.ts` 空白正文快照保护，不重复修改。
  - FinPlus 宿主私有滚动 Hooks（`useAutoScroll`/`useScrollState`/`useStreamScroll`）、Zustand Slices（`chatSlice`/`workspaceSlice`）、`FileListDrawer`、`usageText.ts` 及命令/MCP 之外的 24 个业务工具中文标签与图标枚举，保留在宿主层（通过 `renderers` 扩展），不进 Kit。

## Capabilities

### New Capabilities

- `chat-core-protocol`: 定义 `chat/core-sse` 命令工具生命周期合并、OPC 工具块字段拆分、全块时间线入轴与流式汇报，以及纯数据辅助函数 `getCommandToolName`、`isOpcBlockStreaming`、`groupOpcTimeline` 的协议行为与依赖纯度约束。
- `chat-message-ui`: 定义 `ToolExecutionCard` 可折叠工具执行卡、`MessageContent` 命令工具与状态字段扩展、内置命令/MCP/通用工具渲染升级、兼容导出保留（`ToolCallMsg`/`ToolCallResponse`）、ghost 折叠面板交互、中性灰度思考扫光及新增主题 CSS 变量契约。
- `chat-opc-ui`: 定义 `OpcStatus` 的 `iconOnly` 能力、`OpcTimelineEntry`（`dispatch`、`leader`、`report`）结构与样式升级、`OpcAnswer` 时间线内页脚与处理中插槽，以及向后兼容现有 OPC 调用方的展示契约。

### Modified Capabilities

<!-- openspec/specs/ 当前为空，本次为首批规格基线 -->

## Impact

- **Core 源码**：`src/chat/core-sse/index.ts`、`src/chat/core-sse/ordinary.ts`、`src/chat/core-sse/opc.ts`（及可选共享纯工具文件）。
- **UI 与样式源码**：`src/chat/ui/tokens.less`、`src/chat/ui/runningShine.module.less`、`src/chat/ui/message/`（`index.ts`、`types.ts`、`Content.tsx`、`MessageCollapse.tsx`、`MessageContentItem.tsx`、`message.module.less`、新增 `ToolExecutionCard.tsx` / `toolExecutionCard.module.less`）、`src/chat/ui/opc/`（`OpcIdentity.tsx`、`OpcRound.tsx`、`opc.module.less`、`index.ts`）。
- **测试、校验与文档**：`tests/core-sse.test.mjs`、`tests/core-opc.test.mjs`、`tests/message-ui.test.mjs`、`scripts/verify-exports.mjs`、`docs/guide/getting-started.md`、`docs/reference/content.md`、`docs/reference/opc.md`、`docs/sdk/components.md`、`docs/examples/message-content.tsx`、`docs/examples/opc-conversation.tsx`。
- **外部消费者兼容性**：保留所有已有公开导出与旧 props 语义；对旧版 `tests/core-sse.test.mjs`（bash 独立 `TOOL_RESPONSE` 断言）与 `tests/core-opc.test.mjs`（旧 `timeline` 断言）中的行为变更在对应 spec 与 `design.md` 中显式说明。
