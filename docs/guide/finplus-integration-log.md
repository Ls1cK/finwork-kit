---
title: FinPlus 接入阶段记录
description: 记录 @lz19.02/finwork-kit@0.1.0 接入 FinPlus 的各阶段完成内容、遇到的问题、处置方案与验证结果。
---

# FinPlus 接入阶段记录

记录 `@lz19.02/finwork-kit@0.1.0`（`main@b42fa10`）接入 `fin-plus`（`master@12bf04d5`）的阶段进展、问题定位与验证基线。对应 OpenSpec 变更为 `fin-plus/openspec/changes/integrate-finwork-kit-chat`。

## 1. 接入基线与阶段路线

| 项目 | 基线说明 |
| --- | --- |
| Kit 仓库基线 | `@lz19.02/finwork-kit@0.1.0`（`main@b42fa10`） |
| 宿主仓库基线 | `fin-plus`（`master@12bf04d5`） |
| 公开消费入口 | `chat/core-sse`、`chat/core-detail`、`chat/ui`、`chat/style.css` |
| 环境约束 | Node `v22.9.0` · `pnpm@8.12.1` |

| 阶段 | 目标 | 当前状态 |
| --- | --- | --- |
| 阶段 0 | 包产物接入、交接锁文件与构建基线（Tasks 1.1–1.3） | 已完成 |
| 阶段 1 | 新旧解析对等测试基线（Tasks 2.1–2.3） | 已完成 |
| 阶段 2 | 基于现有 Store 接入 Kit `chat/ui`（Tasks 3.1–3.4） | 已完成 |
| 阶段 3 | 切换 `core-sse` 与 `core-detail` 协议归并（Tasks 4.1–4.4） | 已完成 |
| 阶段 4 | 内测准入门槛（Tasks 5.1–5.3） | 部分完成（5.2 已完成，5.1/5.3 待内网） |
| 阶段 5–6 | 全量切换验收与观察通过后清理（Tasks 6.1–6.2） | 待开始 |

### 提案两轮审阅修订摘要

在启动阶段 0 前，围绕协议、并发、容错与交付门禁完成了两轮审阅修订（共 9 项）：

1. **详情轮询全生命周期归属**：新增 `TaskDetail.activeRoundId`（由 `initAgentProcessing` 写入、SSE 收尾不清、仅被下一轮覆盖），将归属校验覆盖 `loadTaskDetail` 请求发起、响应提交、失败清理、轮询标志清理及成功回调，确保「A 正常关闭后详情成功提交」且「B 启动后拒绝 A 迟到结果」。
2. **跨任务首帧状态隔离**：移除共享 `isReceivedMsg` ref，改用请求局部 `receivedMessageCount` 判定空流与首帧工作区联动，消除并发轮次误报“未收到任何消息”。
3. **实时追问写回 Kit 快照**：`answerUserQuestion` 坚持使用协议原始 `sourceId`（`pendingQuestion.id`）提交 `chunkId`，请求成功后核对同轮次与问题归属再向同一 Kit `RoundState` 派发 `user.answer` 事件并重投影。
4. **外网/内网锁文件与 SHA-512 交接契约**：保持镜像 `.gitignore` 规则不变，外网提供自包含交接包（`package.json` + 精确匹配 `.tgz` 的 `pnpm-lock.yaml` + `.tgz` + `SHA512.txt`）；内网切换 `"0.1.0"` 前先校验分发包 SHA-512 并保留内网 `pnpm-lock.yaml` 用于冻结安装。
5. **互斥历史三态容错与日志接口**：以单一 `hasRecoverableContent(rounds)` 清单（含产出文件与用量）严格互斥区分「合法空历史 / 部分损坏但存在可恢复内容 / 完全无法恢复」，统一复用既有 `sseLog.error`（不新增 `sseLog.warn`）。
6. **全部 4 个元数据读者与字段转换**：统一收敛 `MessageContentList`、`ChatCompletedResult`、`StoreUserMessage`、`OpcAnwser` 与 `usageText.ts`，并将 Kit 的 `completion.durationSeconds` 转换为 `duration_seconds`。
7. **独立交付与切换门禁**：拆分内测准入、全量切换验收与切换观察通过后的旧实现清理。

---

## 2. 阶段 0：包产物接入、交接锁文件与构建基线（已完成）

### 2.1 完成内容

- **Task 1.1（包产物打包与冻结安装交接）**：
  - 在 `finwork-kit` 执行 `pnpm build:lib` 与打包，产出 `fin-plus/debs/lz19.02-finwork-kit-0.1.0.tgz`（48 个白名单文件，压缩后 `111,687` bytes，解包 `372,190` bytes）。
  - 记录校验信息：`shasum: 6cfb5354051569416eb5d3b9f483de97e3f21fe6`，`integrity: sha512-nNK8P2OE5vxfPHrQOUSPeF0pQ4prAPYOvLmVFtZNKIZHapm2ve5xTDQDE5dAVMqUDvr7SPnBNwCufeQmn0AXjA==`。
  - 清除本地遗留的 `file:../finwork-kit` 锁记录，在 `fin-plus/package.json` 接入 `"file:./debs/lz19.02-finwork-kit-0.1.0.tgz"`，并在 `.gitignore` 忽略目录 `debs/finwork-kit-0.1.0-handoff/` 留存自包含交接包。
- **Task 1.2（样式预加载与变量桥接）**：
  - `src/main.tsx` 静态预加载 `@lz19.02/finwork-kit/chat/style.css`，先于懒加载聊天组件生效。
  - `src/index.less`（`:root`）映射 17 个 `--finwork-*` 变量（含主色 `#A30030`、中性文字/背景/边框及代码块主题变量）。
- **Task 1.3（公开入口冒烟与构建基线）**：
  - 新增 `src/pages/FinWork/__tests__/kitEntriesSmoke.test.tsx`，验证 4 个公开入口导出可用。

### 2.2 遇到的问题与处置

| 问题现象 | 根因分析 | 解决方式 |
| --- | --- | --- |
| 沙盒内执行 `npm pack` 报错退出（exit code 1） | `npm` 默认向宿主 `~/.npm` 写入日志与缓存，被沙盒目录隔离拦截 | 在 `pnpm build:lib` 之后追加 `--ignore-scripts --cache /tmp/finwork-kit-npm-cache` 执行打包 |
| 沙盒内 `pnpm install` 触发 `ERR_PNPM_FETCH_403` / 权限失败 | 沙盒默认无外网且隔离了宿主 pnpm store | 仅对单条 `pnpm install` 与临时目录 `pnpm install --frozen-lockfile` 切出沙盒执行，构建与测试仍留沙盒内 |

### 2.3 验证结果

- 干净临时目录 `/tmp/finplus-frozen-verify` 校验 SHA-512 一致后执行 `pnpm install --frozen-lockfile`：通过（`reused 705, downloaded 0, added 705`，未触发 `ERR_PNPM_NO_LOCKFILE` / `ERR_PNPM_OUTDATED_LOCKFILE`）。
- `kitEntriesSmoke.test.tsx`：2/2 通过。
- `tsc --noEmit`：0 错误；受影响文件只读 ESLint（`--max-warnings 0`）：0 错误、0 警告。
- `pnpm build`（38.05s）通过，产物体检确认主构建 CSS 含 `--finwork-primary-color` 与 Kit 组件样式（如 `_expertPanel_`、`_toolCallCard_`）。

---

## 3. 阶段 1：新旧解析对等测试基线（已完成）

### 3.1 完成内容

- 在 `fin-plus/src/pages/FinWork/__tests__/store/` 新增双实现对照测试套件：
  - `kitParityHarness.ts`：对齐 SSE 实时批处理与服务端历史回放的投影比对骨架；
  - `kitParityRecordings.test.ts`（16 用例）：覆盖全部 7 份本地 SSE 录制（共 5,501 帧：`default` 733、`markdown-switch` 38、`plain-text` 32、`user-question` 10、`opc-guide` 40、`opc-writing` 176、`opc-team` 4,472），按 `1 / 37 / 512` 帧分批跑实时流并与 Kit `replayTaskRecords` 及 FinPlus 旧解析对照；
  - `kitParityEdges.test.ts`（9 用例）：覆盖普通对话、子智能体集群封口归属、引用锚点、OPC 同专家多次派发、缺 `taskType` 旧分享推断、空历史后追问、单一 `hasRecoverableContent` 判定的三态容错（含「正文损坏但产出文件仍可下载」）。

### 3.2 遇到的问题、关键差异与处置

初始对照运行出现 8 处差异/测试预期偏差，经逐项核查协议与双方实现源码后全部定案：

1. **元数据上提与 `durationSeconds` 转换**：Kit 将 `TASK_COMPLETED`（`durationSeconds`）与 `EXECUTION_USAGE` 上提到轮次顶层 `completion` / `executionUsage`，而 FinPlus 既有 4 个 UI 读者（`MessageContentList`、`ChatCompletedResult`、`StoreUserMessage`、`OpcAnwser`）及 `usageText.ts` 均读 `contentList` 与 `duration_seconds` → 纳入阶段 2 `kitAdapter/metadata.ts` 统一收敛。
2. **OPC 工具名大小写**：Kit `opc.ts` 保留 `Read`/`Bash` 原始大小写（不同于普通对话 `ordinary.ts` 转大写）→ 阶段 2 `kitAdapter/opc.ts` 显式调用 `normalizeToolCallName`。
3. **工具生命周期合并优于旧实现**：`TOOL_CALL_END` 携带的 `input`/`output`/`state` 及带 `input` 的孤立 `TOOL_CALL_END`，Kit 会正确合并/恢复而旧实现会丢弃 → 拆分 `TOOL_RESPONSE` 对等用例与 `_END` 增强说明用例，以 Kit 为准。
4. **普通历史 `USAGE_INFO` 残留**：旧实现在历史回放中将 `USAGE_INFO` 留入 `contentList`（UI 渲染 `null`），Kit 仅写入 `state.usage` → 在对照校验中跳过 `USAGE_INFO`，以 Kit 为准。
5. **OPC 用量字段完整性（`opc-team.sse`）**：旧实现仅抽取 `total_tokens`/`start_time`/`end_time`，Kit 额外保留 `execution_time: 209.986581`、`input_tokens`、`output_tokens` → 对比共同字段并明确断言 Kit 保留完整 `executionUsage`。
6. **半截流结束封口（`opc-guide` 切片）**：流未正常完成而关闭时，Kit `endInput` 将仍为 `running` 的子回复收口为 `uncompleted` 且 `streaming: false`，旧实现仍停在 `running` → 明确断言各自状态，阶段 3 以 Kit 为准防止永久 loading。
7. **缺 `taskType` 畸形 OPC 帧校验**：Kit `replayTaskRecords` 额外校验 `reply_id`、`opc.agent_id` 与 `agent_role`，拒绝畸形 `OPC_AGENT_REPLY_START` 误判为 OPC → 以 Kit 为准。
8. **`user-question.sse` 原生 `text_delta`**：Kit 原生消费 `text_delta` 并在 `ASK_USER_QUESTION` 前后分为两段 `ASSISTANT_MSG`，旧录制测试依赖 `expandMockChatFrames` 先展开 → 阶段 3 Mock 流透传，内容等价。
9. **对照夹具修正**：进度关键路径映射键名为 `/workspace/output/task_plan.md`；Kit 截断 `<data>` 标签诊断码为 `'incomplete_frame'`（非 `'unclosed_data_tag'`）。

### 3.3 验证结果

- 6 个 Vitest 文件（`kitParityRecordings.test.ts`、`kitParityEdges.test.ts`、`sseLifecycle.test.ts`、`subagentCluster.test.ts`、`reference.test.ts`、`opcState.test.ts`）：**82/82 全部通过**（1.68s）。
- `tsc --noEmit`：0 错误；3 个新增测试文件只读 ESLint（`--max-warnings 0`）：0 错误、0 警告。
- `openspec validate integrate-finwork-kit-chat --strict`：通过。

---

## 4. 阶段 2：基于现有 Store 接入 Kit `chat/ui`（已完成）

### 4.1 完成内容

- **Task 3.1（兼容类型、统一元数据与 `kitAdapter/` 纯适配层）**：
  - `src/pages/FinWork/types.ts`：为 `Message` 扩展可选顶层字段 `completion?: RoundCompletion` 与 `executionUsage?: RoundUsage`。
  - `src/pages/FinWork/components/Chat/ChatPanel/kitAdapter/metadata.ts`：提供 `readMessageCompletion`、`readMessageExecutionUsage` 与 `hasMessageCompletion`，优先消费上提字段并回退扫描 `contentList`（同时完成 `completion.durationSeconds` → `duration_seconds` 转换）。
  - `src/pages/FinWork/components/Chat/ChatPanel/MessageItem/usageText.ts`：兼容读取上提对象与旧 `contentList` 包装结构，覆盖 `getMessageStartTime`、`getTaskExecutionTime`、`getTaskCompletedSplitData` 与 `buildUsageTextList`。
  - `src/pages/FinWork/components/Chat/ChatPanel/kitAdapter/ordinary.tsx`：基于 Kit `MessageContentList` / `ThinkContent` / `ToolCallMsg` / `MarkdownCodeBlock` / `MultiSubAgentCard` / `SubAgentListItem` 实现宿主 `renderers` 与 `createReferenceRenderer`（保留中文/MCP 工具标签、`deltaKey` 摘要、Bash `delta.command` 无 `input` 回退、失败态、花名/类型配色、`SubAgentSpace` 跳转定位、`ReferenceAnchor` 引用浮层与埋点）。
  - `src/pages/FinWork/components/Chat/ChatPanel/kitAdapter/opc.ts`：基于 Kit `resolveOpcExecution` 实现 `toOpcRoundState`、`buildOpcTimelineEntries`、`toOpcExecutionContentList` 与 `buildOpcExpertViewModel`，并在 OPC 工具展示前显式调用 `normalizeToolCallName` 处理非 `mcp__` 工具名。
- **Task 3.2（切换普通对话 UI 与 4 处元数据读者）**：
  - `MessageContentList.tsx`、`AiMessage.tsx`、`UserMessage.tsx`、`ExecutionProcessCollapse.tsx`、`ChatCompletedResult.tsx`、`MessageItem/index.tsx` 切换为渲染 Kit `chat/ui` 原语并通过统一元数据辅助函数读取 `completion` / `executionUsage`（保留 `[data-chat-row-id]` 锚点、窄 selector 订阅、`UserQuestionInput` 与 `ChatAnswerFooter` / `OutputFilesCollapse` / `SkillOutputCard`）。
  - `WorkspaceDrawer/SubAgentSpace/index.tsx` 补充透传 `taskId`，使子智能体抽屉同步使用 Kit `MessageContentList` 与引用解析。
- **Task 3.3（切换 OPC 协作时间线与专家执行面板）**：
  - `OpcAnwser/index.tsx` 切换为 Kit `OpcAnswer` + `buildOpcTimelineEntries`，通过 `hasMessageCompletion(answer)` 控制 `ChatAnswerFooter` 展示并保留无团长回复时的 `summary` 兜底。
  - `WorkspaceDrawer/OpcExpertSpace/index.tsx` 切换为 Kit `OpcExpertPanel`、`StreamingMarkdownRenderer` 与 `buildOpcExpertViewModel`（调用 Kit `resolveOpcExecution`）。
- **Task 3.4（测试更新与 8 入口回归）**：
  - 更新 `usageText.test.ts`、`UserMessage.test.tsx`、`opcExpertSpace.test.tsx`，并新增 `src/pages/FinWork/__tests__/components/kitChatUiAdapter.test.tsx`，覆盖 4 处上提元数据读取、普通与 OPC 工具渲染/归一化、子智能体选中跳转、引用锚点、分享页只读与折叠头防冒泡、`SkillOutputCard` 关联等全部核心路径。

### 4.2 遇到的问题与处置

| 问题现象 | 根因分析 | 解决方式 |
| --- | --- | --- |
| 运行单测时 `MessageContentList` 触发 React 18 `Maximum update depth exceeded` 与 `getSnapshot should be cached` 警告 | 在 Zustand `useShallow` selector 内部调用 `readMessageCompletion`，其每次返回新对象引用 `{ status, message, duration_seconds }`，导致浅比较判定快照持续变化并陷入无限重渲染 | `useShallow` 仅订阅 store 原始稳定字段（`rawCompletion`、`rawExecutionUsage` 及回退条目引用），在 `useMemo` 内调用 `readMessageCompletion` / `readMessageExecutionUsage`；`ChatCompletedResult.tsx` 同步按此规范改造 |
| `tsc --noEmit` 在 `chatSlice.ts:194` 报 `WritableDraft<OpcRoundState>` 只读数组不兼容 | Kit `OpcRoundState` 使用 `readonly` 数组，与 FinPlus 现有 Immer `WritableDraft<Message>[]` 扩展赋值冲突，而阶段 2 仍走旧 `opcTimeline` | 在阶段 2 严格按 `Task 3.1` 仅扩展 `Message.completion` / `executionUsage`；`toOpcRoundState` 通过交叉参数类型兼容可选 `opcRound`，将 store 侧 `opcRound` 存储留待阶段 3 切换 `chatSlice` 时一并处理 |
| `kitAdapter/ordinary.tsx:79` `tsc` 报 `getFileNameFromPath(rawDeltaValue)` 类型错误 | `MessageContentDeltaType` 含 `image_urls?: string[] | string`，联合属性未收窄为 `string` | 仅在 `deltaKey === 'file_path' && typeof rawDeltaValue === 'string'` 时调用 `getFileNameFromPath` |
| `opcExpertSpace.test.tsx` 旧下拉查询 `[aria-haspopup="menu"]` 失效 | Kit `OpcExpertPanel` 使用 Antd `Select`（`aria-label="选择任务"`）替代旧 `Dropdown` 菜单 | 保留全部功能与文案断言，将测试中的任务选择器查询更新为 `[aria-label="选择任务"]` 对应的 `.ant-select` 容器 |
| `happy-dom` 下将 `<MessageContentList>` 直接包入 `<Checkbox>`（`<label>`）时 `thinkHeader.click()` 仍触发了 Checkbox 变化；`SkillOutputCard` 标题不含 `.zip` 后缀 | Antd `<Checkbox>` 渲染为原生 `<label>`，与 `SharePanel` 实际兄弟结构（`<Checkbox>` 与 `.checkContent` 并列处于 `<Checkbox.Group>` 内）不同；`SkillOutputCard` 展示时剥离 `.zip` 扩展名 | 按 `SharePanel` 真实 DOM 结构用 `<Checkbox.Group>` + 外层点击监听验证 `THINK_MSG` 折叠不冒泡；用例断言对齐 `demo-skill` |

### 4.3 验证结果

- 12 组 FinPlus focused Vitest（`kitChatUiAdapter.test.tsx`、`opcExpertSpace.test.tsx`、`messageList.test.tsx`、`userQuestionInput.test.tsx`、`usageText.test.ts`、`UserMessage.test.tsx`、`chatAutoScroll.test.tsx`、`chatNavigator.test.tsx`、`chatStreamScroll.test.tsx`、`chatScrollPinning.test.tsx`、`kitEntriesSmoke.test.tsx`、`kitParityEdges.test.ts`）：**56/56 全部通过**。
- 受影响文件只读 ESLint（`--max-warnings 0`）：**0 错误，0 警告**；`tsc --noEmit`：**0 错误**。
- `pnpm build`（30.38s）通过。
- `finwork-kit` 仓内源码未改动，`pnpm typecheck` 与 `pnpm check:boundaries` 均通过。

---

## 5. 阶段 3：切换 `core-sse` 与 `core-detail` 协议归并（已完成）

### 5.1 完成内容

- **Task 4.1（全生命周期轮次归属与请求局部计数）**：
  - `fin-plus/src/pages/FinWork/types.ts` 新增 `TaskDetail.activeRoundId?: string`（由 `initAgentProcessing` 写入，SSE 关闭时不清空，仅被下一轮覆盖）。
  - `fin-plus/src/pages/FinWork/hooks/useAgentChat.ts` 移除共享 `isReceivedMsg` ref，改用请求局部 `receivedMessageCount` 判定空流与首帧 VNC 恢复；将 `curAnswerId` 贯穿普通 / OPC / Mock 流、`abortControllerRef`、`loadTaskDetail({ roundId: curAnswerId })`、完成回调与 `finally` 收尾。
- **Task 4.2–4.3（`core-sse` / `core-detail` 切换、`kitProtocol.ts`、追问写回与三态容错）**：
  - 新增 `fin-plus/src/pages/FinWork/store/utils/kitProtocol.ts`（并由 `kitAdapter/metadata.ts` 再导出 `hasRecoverableContent`、`classifyReplayRecovery` 与 `ReplayRecoveryState`），统一承担 Kit ↔ FinPlus 投影、`projectOpcTimeline`（`sourceId` 与 `leader.blockId` 规范映射）、`hydrateOrdinaryRound` / `hydrateOpcRound`、进度提取及历史记录投影。
  - `sse.ts` 切换至 `createRound` + `reduceStreamBatch` + `finalizeSSERound`（`input.end` 收口）；`detail.ts`（`processTaskRecords`、`hasOpcTaskRecords`）切换至 `replayTaskRecords`。
  - `chatSlice.ts` 在闭包维护 `liveRounds: LiveRoundsMap`，为 SSE 推入、结束、报错与 `loadTaskDetail` 全链路增加 `activeRoundId` / `answerId` 守卫；`answerUserQuestion` 以协议 `sourceId`（`pendingQuestion.id`）校验归属后派发 `user.answer` 写回同一 Kit 快照；`loadTaskDetail` / `loadShareTaskDetail` 统一执行互斥三态容错并接入 `sseLog.error`。
- **Task 4.4（测试迁移与阶段 3 闭环回归）**：
  - 迁移 `useAgentChat.test.tsx`、`chatSlice.test.ts`、`opcState.test.ts`、`mockSseFlow.test.tsx`、`kitParityHarness.ts`、`kitParityEdges.test.ts` 契约断言，并新增全周期轮次竞态、跨任务 `receivedMessageCount` 隔离、实时追问写回抗回退与抗串轮、三态历史恢复及 OPC 端到端闭环用例。

### 5.2 遇到的问题与处置

| 问题现象 | 根因分析 | 解决方式 |
| --- | --- | --- |
| 工具详情、子智能体及 OPC 接口类型在宿主 `kitProtocol.ts` 对接时报错 | Kit `core-detail` 导出类型为 `ReplayedTaskRecords`、`OrdinaryRoundState` 用 `activeContentId` 表达流式 cursor、`toolCallDetails` 承接工具 `input/output/state`、`OPC_TIMELINE_KIND.REPORT` 为 `'report'` 且 OPC `contentList` 为可选 `AnswerQuestionBlock[]` | 核对已安装产物 `.d.ts` 后在 `kitProtocol.ts` 与 `sse.ts` 完成精准字段映射与可选保护，未改动 Kit 源码 |
| `chatSlice.test.ts:251` 预置未封口 `SUBAGENTS + CONTEXT_COMPRESS` 用例丢失 `CONTEXT_COMPRESS` | 单测通过 `setState` 直接预置 `contentList` 而未经过 `initAgentProcessing`，`liveRounds` 缺失导致 `resolveTaskRoundEntry` 新建了空白 `createRound` | 在 `sse.ts` `resolveTaskRoundEntry` 遇到 `liveRounds` 缺失但已有 `opcTimeline` / 非空 `contentList` 时先水合再归并 |
| `opcState.test.ts:78,137` 出现消息对象原地突变及关闭浏览器后 `workspaceUIkey` 未复位 | `applyRoundStateToTask` 原地修改消息对象，且 `browser.close` intent 仅重置 `isWorkspaceOpen` 未复位 `UI_WORKSPACE_KEYS.FILE` | 改为浅拷贝替换 `td.messages[targetIdx]` 保持非 Immer 下不可变性，并在 `browser.close` 且当前为浏览器视图时同步重置 `workspaceUIkey = UI_WORKSPACE_KEYS.FILE` |
| `opcState.test.ts:164` OPC 实时流与历史 `opcTimeline` `streaming` / `status` 不一致 | 历史回放在 EOF 自动 `input.end` 将未结束 `leader` 收口为 `uncompleted` / `streaming: false`，而实时流单测未触发 `input.end` | 在单测实时流收尾处调用 `finalizeSSERound(task, answerId, 'closed')` 对齐真实 SSE 关闭语义 |

### 5.3 验证结果

- 只读 ESLint（13 个改动与测试文件，`--max-warnings 0`）：**0 错误，0 警告**；`tsc --noEmit`：**0 错误**。
- FinWork 全量 Vitest（51 个测试文件）：**51/51 文件、362/362 用例全部通过**（12.26s）。
- `pnpm build`：**通过**（27.51s）；`finwork-kit` `pnpm typecheck` 与 `pnpm check:boundaries`：**均通过**。

---

## 6. 阶段 4：内测准入门槛（部分完成：5.2 已完成，5.1/5.3 待内网）

### 6.1 外网可执行部分完成内容

- **全仓回归验证**：在 `fin-plus` 执行 `pnpm test:run`，**168/168 测试文件、1,202/1,202 用例全部通过**（46.46s）。
- **Task 5.2（`pnpm dev:mock` 主应用浏览器实测）**：
  - 验证 `http://localhost:5173` 冷启动无白屏与无样式闪烁，`--finwork-primary-color: #a30030` 生效，已加载样式含 8 条 `@media (prefers-reduced-motion: reduce)` 规则；全流程 **0 个未捕获 `pageerror` 与 React 渲染崩溃**。
  - 验证折叠块箭头展开/收起、`.hljs-*` 语法高亮与复制 `"已复制"`、反馈弹窗与点踩图标、滚轮与回顶按钮、`mock-user-question` 回显、`SharePanel` 折叠头防误触、`OPC`（`mock-opc` / `mock-opc-guide` / 实时《雨后街道》）及 `OpcExpertSpace` 任务下拉切换、只读分享页 `share-task/mock-share-opc`（0 console error）、`CreateSkill / LeftChatPanel`（0 console error）及 `ExpertCreator`。
- **内网交接清单整理**：汇总至 `fin-plus/openspec/changes/integrate-finwork-kit-chat/evidence/stage-4-beta-gate.md`，附 `debs/finwork-kit-0.1.0-handoff/` 与精确 `SHA-512` 校验基准。

### 6.2 观察记录与待内网补测项

- **外网 Mock 缺失项**（需在 `Task 5.3` 内网真实环境重点补验）：`GET /api/v1/task/file-detail` 与 `POST /api/v1/expert/search-new` 在 `dev:mock` 下未 mock（返回 500），故 `mock-feedback-downvoted` 在线文件预览/下载、`/finwork/expert/:expertId`（`ExpertDetail`）、以及实时交互式 `ASK_USER_QUESTION` 提交、`ReferenceAnchor`、真 `SUBAGENTS` 集群交互和 `opc-team.sse` 4,472 帧同环境性能对比/回退演练留待内网执行。
- **Task 5.1 & 5.3 状态**：当前保持 `[ ]`（外网无内网 npm registry 与真实后端链路）。

---

## 7. 后续阶段记录（待实施）

- **阶段 4 收尾（Tasks 5.1, 5.3）**：内网切换 `"0.1.0"` 与 `SHA-512` 锁文件冻结安装、内网真实链路与 4,472 帧性能基线对比、上一版产物回退演练。
- **阶段 5–6（Tasks 6.1–6.2）**：全量切换独立验收与观察通过后旧实现清理。
