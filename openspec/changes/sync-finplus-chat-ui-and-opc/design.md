## Context

`@lz19.02/finwork-kit@1.0.0-beta.0` 当前与 `fin-plus` 未提交工作区在以下三个层面产生了演进差（见 `proposal.md`）：
1. `chat/core-sse` 的命令工具归并、OPC 工具块字段与 OPC 时间线事件规则；
2. `chat/ui/message` 的工具执行卡片视觉重构、折叠面板交互与中性灰度思考扫光；
3. `chat/ui/opc` 的派发/团长/团员节点结构、图标态 `OpcStatus` 与时间线页脚插槽。

同时，经对比确认，Markdown 预处理、引用锚点（`preprocess.ts` / `referenceAnchors.ts` / `ReferenceAnchor`）、`core-detail` 帧扫描与 `\u` 探测、`ordinary.ts` 空白正文快照保护已在 Kit 中完成同步，本设计不再重复修改。

```text
chat/core-sse (ES2020, 零 DOM/React)
  ├─ commandTool.ts (getCommandToolName)
  ├─ ordinary.ts ──▶ 命令工具 TOOL_CALL_END / TOOL_RESPONSE 回并
  └─ opc.ts ───────▶ delta/input 分离 · 全块入轴 · dispatch.replyId · 流式 report
                     导出 isOpcBlockStreaming / groupOpcTimeline
        │
        ▼ (类型与纯函数契约)
chat/ui (React 18 + Antd v4 peer + CSS Modules + Less)
  ├─ tokens.less / runningShine.module.less
  ├─ message/ ──▶ ToolExecutionCard + MessageContentItem 升级 + 保留 ToolCallMsg/Response
  └─ opc/ ──────▶ OpcStatus(iconOnly) + OpcRound/Timeline/Answer 兼容扩展
```

## Goals / Non-Goals

**Goals:**
- 保持 `chat/core-sse` 纯净（ES2020、无 DOM/React/CSS）及 `chat/ui` props 驱动与零 `useContext` 约束。
- 对外公开 API 采用向后兼容演进，避免破坏既有 `1.0.0-beta.0` 消费方与外部校验脚本。
- 通过新增纯函数 `getCommandToolName`、`isOpcBlockStreaming`、`groupOpcTimeline` 消除宿主与 Kit 文档示例间的重复状态机。

**Non-Goals:**
- 不改变 `chat/core-detail` 现有逻辑。
- 不将 FinPlus 的 24 个业务工具中文标签/图标映射、滚动控制 Hooks 或 Store 逻辑迁入 Kit。
- 不破坏 `scripts/check-boundaries.mjs`（不允许引入 `clsx` 等未声明依赖）与 `scripts/verify-exports.mjs`（CSS 禁用 `:root`、`.ant-btn`、`#1890ff`、`#a30030`）。

## Decisions

### 1. 保留 `OpcTimelineItem` 中的 `leader.blockId` 而非改为 `blockIndex`
- **背景**：FinPlus 为防止同回复下不同类型块 ID 冲突而改用 `blockIndex`。
- **决定**：Kit 保持 `{ kind: 'leader', replyId, blockId }`，并将 `THINK_MSG`、`TOOL_CALL`、`ASSISTANT_MSG` 全部入轴。
- **理由**：Kit 的 `block.id` 已按 `JSON.stringify([roundKey, replyId, blockType, sourceId])` 构造，同回复不同块类型天然全局唯一且在数组插入时比数字下标更稳定；保留 `blockId` 可避免对现有消费方造成破坏性类型变更。
- **替代方案**：改为 `blockIndex`（如 FinPlus），但会破坏已有 `OpcRoundState` 类型契约，收益为负。

### 2. `OpcToolBlock` 分离 `delta` 与 `input`，双写 `inputComplete` 与 `inputEnded`
- **背景**：FinPlus 需要区分流式 `delta` 预览（用于 `ToolExecutionCard` 标题摘要）与完整 `input`，且使用 `inputComplete` / `responseReceived` 表达命令工具阶段。
- **决定**：`OpcToolBlock` 新增 `delta`、`inputComplete`、`responseReceived`、`returncode`、`stdout`、`stderr`、`error`；`TOOL_CALL` 帧写入 `delta` 而不再覆写 `input`；`TOOL_CALL_END` 同步置 `inputEnded: true` 与 `inputComplete: true`。
- **理由**：`groupOpcTimeline`、详情渲染与旧消费者可无缝共存，无须一次性下线 `inputEnded`。

### 3. 在 `chat/core-sse` 下沉 `getCommandToolName`、`isOpcBlockStreaming` 与 `groupOpcTimeline`
- **背景**：命令工具集合与 OPC 时间线分组合并在普通/OPC 解析和 UI 展示两端重复出现。
- **决定**：将三者作为纯函数在 `chat/core-sse` 实现并从公开入口导出；`chat/ui` 通过相对路径从 `../core-sse/` 复用纯函数 `getCommandToolName`（注意遵循 `check-boundaries.mjs` 对无 UI 反向引用的单向依赖约束：UI 可引用 core 纯工具，core 绝不引用 UI）。
- **替代方案**：分别在 `core-sse` 和 `ui` 各复制一份 `getCommandToolName`，会违背单一事实来源原则。

### 4. CSS 样式与工具依赖遵守 Kit 编译与边界护栏
- **不引入 `clsx`**：`package.json` 的 `dependencies` 未声明 `clsx`，因此 `ToolExecutionCard` 等组件延续 Kit 现有 `[a, b].filter(Boolean).join(' ')` 写法，不新增运行时依赖。
- **使用 `color-mix()` 替代 Less `fade()` / `mix()`**：`tokens.less` 将颜色绑定到 CSS 自定义属性（`var(--finwork-*)`），Less 编译器无法对 CSS 变量执行 `fade()`/`mix()`；因此紫色角色标签、错误文字与状态底色沿用 `opc.module.less` 既有的 `color-mix(in srgb, ...)` 写法，与 `verify-exports.mjs` 禁止硬编码色值（`#1890ff`、`#a30030` 等）的要求兼容。
- **prefixCls 安全的 Antd 选择器**：折叠面板与按钮覆盖继续采用 `:global(:is([class$="-collapse-header"], [class*="-collapse-header "]))` 模式以适配宿主自定义 `prefixCls`。
- **`ToolExecutionCard` 复制能力通过 `onCopy` 注入并附回退**：复用 `chat/ui/markdown/CodeViewer` 已有复制回退模式（优先 `props.onCopy`，缺省尝试 `navigator.clipboard.writeText`），不引入宿主 `@/utils/copy`。

### 5. `OpcTimelineEntry` 与 `OpcAnswer` 的向后兼容插槽设计
- **`leader` 条目**：保留 `content?: string`，新增可选 `process?: ReactNode` 与 `conclusion?: ReactNode`（及受控/非受控折叠 props）。当提供 `process` 或 `conclusion` 时采用「流式直接展开过程，非流式以 `MessageCollapse` 包裹过程 + 下方展示结论」；仅提供 `content` 时维持原 Markdown 直出行为。
- **`report` 条目**：保留 `content?: string`、`note?: string`，新增 `contents?: readonly { id: string; content: string; isStreaming?: boolean }[]` 与可选 `status`；去掉默认强渲染的「团员」角标。
- **`OpcAnswer` 页脚**：新增 `timelineFooter?: ReactNode` 放入 `<ol>` 末项 `<li data-kind="footer">`（`<InfoCircleOutlined />`），新增 `processing?: ReactNode` 置于时间线外左缩进区；原有 `footer?: ReactNode` 保持在 `<ol>` 外部渲染，方便推荐追问或旧接入方平滑迁移。

## Risks / Trade-offs

- **旧单测断言需随新契约同步更新** → `tests/core-sse.test.mjs` 原先断言 `bash` 的 `TOOL_RESPONSE` 为第 3 个独立条目，`tests/core-opc.test.mjs` 原先断言旧 `timeline` 仅含 `dispatch`/`report` 且无 `leader` 过程块与流式 `report`。将在实施阶段按新契约更新这些断言并保留/补充边界用例，同时在变更记录中明示差异。
- **`color-mix()` 与嵌套 CSS 规则对旧浏览器或 Less 版本的兼容** → `less@4.6.7` 与项目现有 `opc.module.less`、`runningShine.module.less` 已验证支持 `color-mix(in srgb, ...)`，且 `verify-consumer.mjs` 会在 Vite 构建中实际检验 CSS 编译结果。
- **内置工具图标与中文文案范围收敛** → Kit 仅内置命令工具与 MCP 文案/图标，其余 24 个业务工具依赖 FinPlus 自身 `renderers` 覆盖；同步后 FinPlus 接入新版 Kit 时仍保留其 `kitAdapter/ordinary.tsx` 的业务 `renderers` 映射即可，不会造成视觉或文案丢失。
