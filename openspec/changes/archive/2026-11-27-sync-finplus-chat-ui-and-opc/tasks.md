## 1. Core SSE 命令工具合并与 OPC 协议演进

- [x] 1.1 在 `src/chat/core-sse/` 新增并导出纯函数 `getCommandToolName`（大小写不敏感匹配 `BASH`、`EXECUTE_SHELL_COMMAND`、`EXECUTE_PYTHON_CODE`），保持 ES2020 无 DOM/React 边界。
- [x] 1.2 更新 `src/chat/core-sse/ordinary.ts`（`OrdinaryBlock` 与 `reduceOrdinaryRound`），将命令工具的 `TOOL_CALL_END` / `TOOL_RESPONSE` 按 `tool_call_id || id` 合并回匹配的 `TOOL_CALL`（写入 `inputComplete`、`responseReceived`、`output`、`stdout`、`stderr`、`returncode`、`state`、`error`，`TOOL_RESPONSE` 保留既有 `delta`/`input`，忽略孤立命令 `TOOL_RESPONSE`，子智能体递归自动继承）。
- [x] 1.3 更新 `src/chat/core-sse/opc.ts` 的 `OpcToolBlock` 与工具合并逻辑：分离 `delta` 与 `input`，同步置位 `inputComplete` 与向后兼容的 `inputEnded`，`TOOL_RESPONSE` 优先按 `tool_call_id` 匹配，大小写不敏感匹配 `TEAMASSIGN` 并将派发工具块 `state` 置为 `'success'`。
- [x] 1.4 更新 `src/chat/core-sse/opc.ts` 的 `timeline` 归并：团长所有新建块（`THINK_MSG`、`TOOL_CALL`、`ASSISTANT_MSG`）以 `{ kind: 'leader', replyId, blockId }` 入轴；`dispatch` 绑定 `replyId` 并仅合并同 `replyId` 相邻派发；团员出现非空 `ASSISTANT_MSG` 即刻去重入轴 `report`（`OPC_AGENT_REPLY_END` 幂等兜底）。
- [x] 1.5 在 `src/chat/core-sse/` 实现并导出纯函数 `isOpcBlockStreaming` 与 `groupOpcTimeline`（含对应导出类型），并在 `src/chat/core-sse/index.ts` 统一导出。
- [x] 1.6 更新并补充 `tests/core-sse.test.mjs` 与 `tests/core-opc.test.mjs`，覆盖命令工具合并、孤立/非命令 `TOOL_RESPONSE`、子智能体命令工具、`OpcToolBlock` 字段分离、`TEAMASSIGN` 大小写、团长全块入轴、流式 `report` 与 `groupOpcTimeline`。

## 2. 主题 Token、思考扫光与折叠面板样式同步

- [x] 2.1 在 `src/chat/ui/tokens.less` 新增带默认值的 `@text-title`（`--finwork-text-title`）、`@text-disabled`（`--finwork-text-disabled`）与 `@purple`（`--finwork-purple-color`）。
- [x] 2.2 更新 `src/chat/ui/runningShine.module.less`，将 `@think-cycle-duration` 调整为 `2s`，`.thinkShine` 改用 `110deg` 中性灰度渐变并补充 `-webkit-background-clip: text`。
- [x] 2.3 更新 `src/chat/ui/message/MessageCollapse.tsx`、`src/chat/ui/message/Content.tsx`（`ThinkContent`、`TaskCompletedSplit`）与 `src/chat/ui/message/message.module.less`，同步 ghost 折叠头悬停样式（prefixCls 安全选择器）、思考标题字号/颜色、去除任务完成折叠头底线与收紧间距，以及内联箭头 `aria-hidden="true"`。

## 3. ToolExecutionCard 与内置工具渲染升级

- [x] 3.1 新增 `src/chat/ui/message/ToolExecutionCard.tsx` 与 `src/chat/ui/message/toolExecutionCard.module.less`（不用 `clsx`、通过 `onCopy` + 剪贴板回退、支持受控/非受控展开、120 字符单行截断预览、空详情 `/` 占位、`data-failed` 失败态与防复选框误触）。
- [x] 3.2 扩展 `src/chat/ui/message/types.ts` 中的 `MessageContent` 字段（`returncode`、`stdout`、`stderr`、`error`、`inputComplete`、`responseReceived`、`inputEnded`）。
- [x] 3.3 更新 `src/chat/ui/message/MessageContentItem.tsx`，将内置命令工具（`BASH`、`EXECUTE_SHELL_COMMAND`、`EXECUTE_PYTHON_CODE`）切换至多状态/多详情 `ToolExecutionCard` 渲染，非命令 `TOOL_CALL`（含 `mcp__*` 与通用工具）切换至 `ToolExecutionCard` 渲染；保留 `src/chat/ui/message/Content.tsx` 与 `index.ts` 中的 `ToolCallMsg`、`ToolCallResponse` 兼容导出，并新增导出 `ToolExecutionCard` 与相关类型。
- [x] 3.4 更新并补充 `tests/message-ui.test.mjs`，覆盖 `ToolExecutionCard` 交互/截断/复制/空态/失败态、命令工具各生命周期标题与 `returncode` 失败判定、MCP 工具、折叠样式回归以及 `ToolCallMsg`/`ToolCallResponse` 兼容导出。

## 4. OPC UI 演进与向后兼容

- [x] 4.1 更新 `src/chat/ui/opc/OpcIdentity.tsx` 中的 `OpcStatus`，使 `status` 与 `label` 可选并支持 `iconOnly` 模式（缺省状态图标回退 `FileSearchOutlined`，保留 Tooltip 与 `aria-label`）。
- [x] 4.2 更新 `src/chat/ui/opc/OpcRound.tsx`、`src/chat/ui/opc/opc.module.less` 与 `src/chat/ui/opc/index.ts`：派发条目改用团长头像、紫色「团长」标签与任务行 `iconOnly` 状态入口；团长条目支持 `process`/`conclusion`（流式直接展开、非流式折叠）并保留 `content` 兼容；团员汇报支持流式多段 `contents`、移除默认「团员」角标并应用 `.reportBody` 纵向 `gap`；`OpcAnswer` 支持 `timelineFooter`（`<li data-kind="footer">`）与 `processing` 插槽同时保留 `footer` 兼容。
- [x] 4.3 在 `tests/message-ui.test.mjs` 补充 `OpcStatus`（`iconOnly`、缺省状态图标）、`OpcTimeline`/`OpcAnswer`（新版派发卡片、团长过程折叠/流式展开、多段团员汇报、`timelineFooter`、`processing` 及旧字段兼容）测试。

## 5. 文档、导出校验与全仓验证

- [x] 5.1 更新 `docs/guide/getting-started.md`、`docs/reference/content.md`、`docs/reference/opc.md`、`docs/sdk/components.md`、`docs/examples/message-content.tsx` 与 `docs/examples/opc-conversation.tsx`（含新 CSS 变量、`ToolExecutionCard`、纯函数、`OpcTimelineEntry` 新字段及专家面板「流式直接展示过程、结束后折叠」示例）。
- [x] 5.2 更新 `scripts/verify-exports.mjs` 覆盖 `ToolExecutionCard` 及新增 `chat/core-sse` 公开导出检查。
- [x] 5.3 在 `finwork-kit` 执行 `pnpm check`（串联 `typecheck`、`check:boundaries`、`test`、`build:lib`、`verify:exports`、`verify:consumer`）及 Node 22 下 `pnpm docs:build`，确认全部通过且 `dist/chat-ui.css` 无违禁字面量。
