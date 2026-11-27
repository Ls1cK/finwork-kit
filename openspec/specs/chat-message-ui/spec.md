# chat-message-ui Specification

## Purpose

定义 `@lz19.02/finwork-kit/chat/ui` 与 `chat/style.css` 中工具执行卡片 `ToolExecutionCard`、命令工具多状态展示、向后兼容导出保留、折叠面板交互、中性灰度思考扫光以及新增 CSS 主题变量的行为与视觉契约。

## Requirements

### Requirement: 轻量化可折叠工具执行卡片 ToolExecutionCard
`chat/ui` SHALL 导出 `ToolExecutionCard` 组件，采用轻量化可折叠行样式替代高占空边框胶囊：
- 头部展示：`[icon] [label + 单行截断 preview(最长 120 字符并附带 …)] [右旋转箭头]`；当 `isRunning` 为 `true` 时标题文字应用扫光类 `thinkShine`；当 `failed` 为 `true` 时根节点设置 `data-failed` 属性并呈现错误着色（提供低版本静态文字色回退，并在 `@supports (color: color-mix(in srgb, red 50%, white))` 下使用 `color-mix()` 混色增强）。
- 展开内容：遍历 `details` 中非 `null`/`undefined`/空字符串的条目，逐项渲染带标签、单块复制按钮与 `<pre tabIndex={0}>`（最大高度 `240px`）的详情面板；若所有条目均为空则展示无障碍占位 `/`（`role="status"`、`aria-label="暂无详情"`）。
- 复制与交互：支持传入 `onCopy` 回调并在缺省时回退内部剪贴板逻辑；支持受控与非受控展开，点击折叠头时阻止事件冒泡与默认行为以兼容外层复选框行。

#### Scenario: 截断超长预览并支持受控/非受控展开与复制
- **WHEN** 向 `ToolExecutionCard` 传入超过 120 字符或多行 `preview` 及非空 `details` 并点击展开与复制按钮
- **THEN** 头部仅显示首行前 120 字符加 `…`，展开后显示格式化详情文本，点击复制触发 `onCopy` 且不触发外层复选框切换

#### Scenario: 空详情与失败态呈现
- **WHEN** `details` 均为空或传入 `failed={true}`
- **THEN** 展开区域渲染 `role="status"` 的 `/` 占位，失败态根节点包含 `data-failed` 属性

### Requirement: MessageContent 扩展字段与内置工具渲染升级
`MessageContent` 类型 SHALL 扩展可选字段 `returncode?: number | string`、`stdout?: string`、`stderr?: string`、`error?: string`、`inputComplete?: boolean`、`responseReceived?: boolean`、`inputEnded?: boolean`。`MessageContentItem` 内置渲染逻辑 SHALL 升级如下：
- **命令工具（`TOOL_CALL` / `TOOL_RESPONSE` 命中 `getCommandToolName`）**：统一使用 `ToolExecutionCard` 渲染（Python 使用 `FunctionOutlined`，Shell/Bash 使用 `CodeOutlined`）；按生命周期呈现状态标题（运行中：`正在输入参数` / `等待执行结果`；已收到响应：`(命令|代码)执行完成` 或 `(命令|代码)执行失败`）；当存在 `error`、非 `'success'`/`'completed'` 的 `state`、或非零数字型 `returncode` 时判定为失败；详情区按顺序汇总 `command`/`code`、剩余 `input` 字段及去重后的 `output` / `stdout` / `stderr` / `error`。
- **其他工具（`TOOL_CALL`）**：使用 `ToolExecutionCard` 渲染（`mcp__*` 使用 `ApiOutlined` 并保留 `正在调用 MCP` / `调用 MCP 完成` 文案，其他通用工具回退 `ToolOutlined` 与工具名）；非命令 `TOOL_RESPONSE` 保持隐藏，业务工具图标与中文文案仍交由宿主 `renderers` 覆盖。

#### Scenario: 命令工具各生命周期状态与失败判定
- **WHEN** `MessageContentItem` 渲染 `EXECUTE_PYTHON_CODE` 或 `BASH` 条目，分别处于「无 `input` 且流式」、「已有 `input` 且等待结果」、「已收到结果且 `returncode: 1`」三种状态
- **THEN** 标题依次显示「正在输入参数」、「等待执行结果」、「代码执行失败」/「命令执行失败」，且失败态附带 `data-failed` 与去重后的 `stderr`/`output` 详情

#### Scenario: MCP 与通用工具保留现有文案与宿主扩展点
- **WHEN** 渲染 `mcp__finance__quote` 与自定义 `renderers` 未覆盖的 `READ_FILE`
- **THEN** 前者显示 `ApiOutlined` 与 MCP 状态文案，后者通过 `ToolExecutionCard` 回退渲染 `ToolOutlined` 及 `input`/`output`；若宿主传入 `renderers.TOOL_CALL` 则优先执行宿主渲染

### Requirement: 保留旧版 ToolCallMsg 与 ToolCallResponse 公开导出
为保证向后兼容，`chat/ui` SHALL 继续导出 `ToolCallMsg` 与 `ToolCallResponse`（及各自 Props 类型），维持现有属性签名与渲染行为不变。

#### Scenario: 现有消费者显式导入 ToolCallMsg 与 ToolCallResponse
- **WHEN** 外部代码从 `@lz19.02/finwork-kit/chat/ui` 显式导入并使用 `ToolCallMsg` 与 `ToolCallResponse`
- **THEN** 类型检查、静态渲染与既有导出校验全部通过

### Requirement: 折叠面板悬停、思考扫光与新增主题 Token
UI 基础样式与组件 SHALL 满足以下更新：
- **折叠面板**：`MessageCollapse` 的 `ghost` 折叠头使用展开后的 `prefixCls` 兼容属性选择器（`[class$="-collapse-header"], [class*="-collapse-header "]`，不依赖 `:is()`）应用物理边距 `margin-left: -8px`、`margin-right: -8px`（替代 `margin-inline`）、`padding: 4px 8px`、`border-radius: 8px` 及 `hover` 时 `@hover` 背景；`ThinkContent` 标题字号设为 `14px`、颜色 `@secondary`；`TaskCompletedSplit` 去掉标题底部边线、将内容区 `padding-top` 与收起态外下边距收紧至 `8px`，并在内联箭头上添加 `aria-hidden="true"`。
- **思考与运行态扫光动效**：`runningShine.module.less` 将 `@think-cycle-duration` 调整为 `2s`，`.thinkHeading` 提供 `height: 1.5em` 前置回退再叠加 `height: 1lh`（兼容不支持 `lh` 单位的低内核浏览器），`.thinkShine` 在 `@supports ((-webkit-background-clip: text) or (background-clip: text))` 下采用 `110deg` 中性灰度渐变（`@text-disabled 35%` → `@text-title 50%` → `@text-disabled 65%`，`240% 100%`）并同时配置 `-webkit-background-clip: text` 与 `background-clip: text`；运行态扫光 `.runningShine::before` 使用基于 `@info` 的渐变配合 `opacity: 0.2`（不依赖 `color-mix()`）。
- **CSS 变量 Token**：`tokens.less` 新增带默认值的 `@text-title: var(--finwork-text-title, #1f1f1f)`、`@text-disabled: var(--finwork-text-disabled, #8c8c8c)` 与 `@purple: var(--finwork-purple-color, #d75cff)`，且编译产物 `dist/chat-ui.css` 不引入未变量化的硬编码违禁字面量，保持通过 `scripts/verify-exports.mjs` 产物检查。

#### Scenario: 未声明新变量的宿主升级后正常显示且产物校验通过
- **WHEN** 宿主仅配置旧版 `--finwork-*` 变量并加载更新后的 `chat/style.css`
- **THEN** `--finwork-text-title`、`--finwork-text-disabled` 与 `--finwork-purple-color` 回退至安全默认值，且 `pnpm verify:exports` 与 `pnpm verify:consumer` 均通过
