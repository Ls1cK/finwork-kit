# chat-core-protocol Specification

## Purpose

定义 `@lz19.02/finwork-kit/chat/core-sse` 的命令工具生命周期合并、OPC 工具字段拆分与时间线全块演化，以及纯数据侧展示辅助函数（`getCommandToolName`、`isOpcBlockStreaming`、`groupOpcTimeline`）的协议行为与无 DOM/React 边界约束。

## Requirements

### Requirement: 命令工具识别纯函数
`chat/core-sse` SHALL 导出纯函数 `getCommandToolName(name: unknown)`，用于以大小写不敏感方式识别命令类工具并返回归一化大写名称（`'BASH'`、`'EXECUTE_SHELL_COMMAND'` 或 `'EXECUTE_PYTHON_CODE'`）；非命令工具或非字符串输入 SHALL 返回 `undefined`。

#### Scenario: 大小写不敏感匹配命令工具
- **WHEN** 传入 `'bash'`、`'Execute_Shell_Command'` 或 `'EXECUTE_PYTHON_CODE'`
- **THEN** `getCommandToolName` 分别返回 `'BASH'`、`'EXECUTE_SHELL_COMMAND'` 与 `'EXECUTE_PYTHON_CODE'`

#### Scenario: 忽略非命令工具与无效输入
- **WHEN** 传入 `'READ_FILE'`、`'mcp__srv__tool'`、`null` 或数字
- **THEN** `getCommandToolName` 返回 `undefined`

### Requirement: 普通对话与子智能体命令工具生命周期合并
当帧属于命令工具（通过已有块或当前帧的 `tool_call_name` / `tool_result_name` 经 `getCommandToolName` 识别）时，普通轮次归并器 `reduceOrdinaryRound` SHALL 将 `TOOL_CALL_END` 与 `TOOL_RESPONSE` 按 `tool_call_id || id` 合并回匹配的 `TOOL_CALL` 条目，而非追加独立的 `TOOL_RESPONSE` 条目。合并时 SHALL 写入 `inputComplete: true`（并在收到 `TOOL_RESPONSE` 时写入 `responseReceived: true`），同时合并 `output`、`stdout`、`stderr`、`returncode`、`state`（读取 `frame.state ?? frame.status`）与 `error`。`TOOL_RESPONSE` SHALL 保留已有 `delta` 与 `input` 不被覆盖。无前置 `TOOL_CALL` 的孤立命令 `TOOL_RESPONSE` SHALL 被忽略，非命令工具的 `TOOL_RESPONSE` SHALL 保持原有独立条目行为。子智能体内层轮次 SHALL 通过递归调用复用相同合并语义。

#### Scenario: 命令工具流式生命周期合并为单一条目
- **WHEN** 依次归并 `TOOL_CALL_START`（`id: 'c1'`、`tool_call_name: 'bash'`）、`TOOL_CALL`（带 `delta`）、`TOOL_CALL_END`（带 `input`）与 `TOOL_RESPONSE`（`tool_call_id: 'c1'`、带 `output`/`stdout`/`stderr`/`returncode`）
- **THEN** `contentList` 仅包含 1 个类型为 `'TOOL_CALL'` 的条目，保留原始 `delta` 与 `input`，同时具有 `inputComplete: true`、`responseReceived: true` 以及完整的执行输出与退出码，且 `lifecycle` 不残留活跃键

#### Scenario: 孤立命令 TOOL_RESPONSE 与非命令 TOOL_RESPONSE 的差异化处理
- **WHEN** 分别收到无前置 `TOOL_CALL` 的命令工具 `TOOL_RESPONSE`（如 `tool_result_name: 'Bash'`）与普通非命令工具 `TOOL_RESPONSE`（如 `tool_result_name: 'READ_FILE'`）
- **THEN** 孤立命令 `TOOL_RESPONSE` 不产生新条目；普通非命令 `TOOL_RESPONSE` 按原有规则产生独立条目

#### Scenario: 子智能体内部命令工具继承相同归并
- **WHEN** 在 `SUBAGENT_TOOL_CALL_START`（`bash`）后依次收到 `SUBAGENT_TOOL_CALL_END` 与 `SUBAGENT_TOOL_RESPONSE`
- **THEN** 该子智能体内层 `contentList` 将结果合并至原 `TOOL_CALL` 块，并标记 `inputComplete: true` 与 `responseReceived: true`

### Requirement: OPC 工具块字段拆分与 TeamAssign 对齐
`OpcToolBlock` SHALL 保持 `delta?: Readonly<Record<string, unknown>>` 与 `input?: unknown` 分离（`TOOL_CALL` 流式帧不再将 `frame.delta` 写入 `input`），并扩展可选字段 `inputComplete?: true`（与已有 `inputEnded?: true` 保持同步以向后兼容）、`responseReceived?: true`、`returncode?: number | string`、`stdout?: string`、`stderr?: string`、`error?: string`。OPC `TOOL_RESPONSE` 帧 SHALL 优先使用 `readId(frame.tool_call_id)`、其次 `readId(frame.id)` 关联工具块与派发记录；当 `TOOL_CALL_END` 命中团长派发工具（大小写不敏感匹配 `'TEAMASSIGN'`）时，SHALL 创建 `OpcAssignment` 并将该团长工具块的 `state` 固定置为 `'success'`，同时保留团员回传内容在 `assignment.result` 中。

#### Scenario: OPC 命令工具分离 delta/input 并按 tool_call_id 合并结果
- **WHEN** 团员或团长先后产生 `TOOL_CALL`（带 `delta`）、`TOOL_CALL_END`（带 `input`）与 `TOOL_RESPONSE`（`tool_call_id` 指向工具 `id`，不重复传 `id`）
- **THEN** `OpcToolBlock` 同时保留 `delta` 与 `input`，同步置位 `inputEnded: true` 与 `inputComplete: true`，并在收到响应后更新 `responseReceived: true` 与命令输出字段

#### Scenario: TeamAssign 大小写不敏感匹配与派发状态固定为 success
- **WHEN** 团长收到 `TOOL_CALL_END` 且 `tool_call_name` 为 `'TEAMASSIGN'` 或 `'TeamAssign'`、含有效 `input.member`
- **THEN** 创建对应 `OpcAssignment`，该工具块的 `state` 置为 `'success'`；后续 `TOOL_RESPONSE` 更新 `assignment.result` 而不覆盖派发完成态

### Requirement: OPC 时间线全块入轴、派发归属与流式团员汇报
`reduceOpcRound` 维护的 `timeline` SHALL 遵守以下规则：
1. **团长全块入轴**：团长回复中任何新建内容块（`THINK_MSG`、`TOOL_CALL`、`ASSISTANT_MSG`）均追加 `{ kind: 'leader', replyId, blockId }`，保留唯一 `blockId` 契约。
2. **派发绑定 `replyId`**：`dispatch` 时间线条目扩展可选 `replyId?: string`（`{ kind: 'dispatch', replyId, assignmentIds }`），仅当上一条时间线为 `dispatch` 且 `replyId` 相同时合并，避免跨团长回复混并。
3. **团员流式汇报**：当团员回复的 `ASSISTANT_MSG` 出现非空（`trim()` 非空）正文时即刻去重追加 `{ kind: 'report', replyId }`；`OPC_AGENT_REPLY_END` 到来时仍执行幂等兜底追加；若团员回复尚未产生非空正文且输入被中断，不追加空 `report`。

#### Scenario: 团长思考与工具块进入时间线
- **WHEN** 团长依次输出 `THINK_MSG_START`、`TOOL_CALL_START` 与 `ASSISTANT_MSG_START`
- **THEN** `state.timeline` 按顺序包含这 3 个块对应的 `{ kind: 'leader', replyId, blockId }` 条目

#### Scenario: 团员首次输出非空文本即生成去重 report 条目
- **WHEN** 团员先输出空白 `WORKER_ASSISTANT_MSG`，随后输出非空 `WORKER_ASSISTANT_MSG`，最后触发 `OPC_AGENT_REPLY_END`
- **THEN** 空白帧不产生 `report`；非空帧到来时 `timeline` 立即出现 1 条 `{ kind: 'report', replyId }`；`OPC_AGENT_REPLY_END` 到来时不重复追加

### Requirement: OPC 纯数据展示辅助函数
`chat/core-sse` SHALL 导出纯函数 `isOpcBlockStreaming(block)` 与 `groupOpcTimeline(state)`：
- `isOpcBlockStreaming(block)`：对 `TOOL_CALL` 返回 `!block.state && !block.responseReceived`，对文本块返回 `block.streaming`。
- `groupOpcTimeline(state)`：将扁平 `state.timeline` 聚合为有序展示条目数组，将同一团长回复内连续的过程块与最多 1 个 `ASSISTANT_MSG` 聚合为一组 `leader` 条目（遇到第二个 `ASSISTANT_MSG`，或在 `dispatch` 节点之后遇到非 `TEAMASSIGN` 工具时切分新组；仅含空白 `ASSISTANT_MSG` 的组被过滤），聚合相邻同回复 `dispatch`，并保留 `report` 条目。

#### Scenario: groupOpcTimeline 按多段回复与派发节点正确分组
- **WHEN** 团长先后经历「思考 -> 工具1 -> 正文1 -> 委派A -> 委派B -> 工具2 -> 正文2」并夹带同一派发节点的 `dispatch`
- **THEN** `groupOpcTimeline` 将「思考 + 工具1 + 正文1 + 委派A + 委派B」归入首组 `leader`，紧随其后输出合并的 `dispatch`，再为「工具2 + 正文2」开启新的 `leader` 组，并过滤掉只包含空白 `ASSISTANT_MSG` 的孤立组

### Requirement: Core 模块零 DOM 与 React 依赖边界
新增或修改的所有 `chat/core-sse` 源码（含共享纯工具模块）SHALL 保持 ES2020 纯 TypeScript 语义，不引入 React、DOM、CSS 或宿主应用模块，`pnpm check:boundaries`、`pnpm typecheck` 与 Node ESM 隔离导入验证 SHALL 全部通过。

#### Scenario: 无 DOM 环境下的边界与隔离消费检查
- **WHEN** 在完成库构建后运行 `pnpm check:boundaries` 与 `pnpm verify:exports`
- **THEN** 核心模块传递依赖检查零报错，且 Node ESM 在 `typeof document === 'undefined'` 下可正常导入并调用全部新增与现有导出
