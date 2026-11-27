## Purpose

定义 `@lz19.02/finwork-kit/chat/ui` 中 OPC 协作组件的演进契约，包括 `OpcStatus` 仅图标模式、`OpcTimelineEntry` 结构与样式升级、`OpcAnswer` 时间线内页脚与处理中插槽，以及对现有调用方的向后兼容。

## ADDED Requirements

### Requirement: OpcStatus 支持可选状态与 iconOnly 模式
`OpcStatusProps` 的 `status` 与 `label` SHALL 改为可选属性，并新增 `iconOnly?: boolean`：
- 当 `iconOnly` 为 `true` 时，隐藏文本标签与右侧箭头（`.stateActionIconOnly`），当 `status` 缺省时图标回退为 `FileSearchOutlined`。
- 提供 `action` 时继续保留 `Tooltip`（`title="查看任务详情"`）与无障碍 `aria-label`（按是否存在 `label` 拼接）。
- 非 `iconOnly` 模式下缺失 `label` 时回退显示 `'查看任务详情'`；保留原有完整 `status` + `label` 调用方式不变。

#### Scenario: iconOnly 仅图标触发详情入口
- **WHEN** 渲染 `<OpcStatus status="running" label="执行中" iconOnly action={{ member: '写作专家', onClick }} />` 或省略 `status` 与 `label` 的 `<OpcStatus iconOnly action={{ member: '写作专家', onClick }} />`
- **THEN** 按钮仅渲染状态图标（缺省时为 `FileSearchOutlined`），不渲染文字标签与右箭头，点击触发 `onClick` 且带有完整 `aria-label`

### Requirement: OPC 时间线条目结构与视觉升级
`OpcTimeline` / `OpcRound` SHALL 支持以下演进同时保持既有字段兼容：
- **派发节点（`dispatch`）**：`OpcTimelineEntry`（`kind: 'dispatch'`）支持可选 `name?: string` 与 `avatarUrl?: string`，时间线左侧轨道图标渲染 `<OpcAvatar role="leader" src={entry.avatarUrl} />`（取代旧灰底 `ApartmentOutlined`），卡片主标题显示 `entry.name || '团长'`、角色标签显示「团长」、下方显示「任务派发」副标题；`OpcDispatch.status` 改为可选，各派发任务行右侧以 `iconOnly` 模式渲染 `OpcStatus`。
- **团长节点（`leader`）**：在保留 `content?: string` 与 `isStreaming?: boolean` 的基础上，新增可选 `process?: ReactNode`、`conclusion?: ReactNode`、`processTitle?: ReactNode`、`processExpanded?: boolean`、`defaultProcessExpanded?: boolean`、`onProcessExpandedChange?: (expanded: boolean) => void`。当存在 `process` 时，若 `isStreaming` 为 `true` 则直接平铺展示 `process`；若非流式则将其包裹在 `TaskCompletedSplit` 或 `MessageCollapse`（`destroyInactivePanel`）内，并在下方展示 `conclusion`（或回退 `content`）。
- **团员汇报节点（`report`）**：在保留 `content?: string` 与 `note?: string` 的基础上，新增可选 `contents?: readonly { id: string; content: string; isStreaming?: boolean }[]` 且 `status` 改为可选；移除默认固定的「团员」角标（若需兼容可通过可选 `roleLabel` 控制或留空），并为 `.reportBody` 应用纵向 `flex` + `12px` 间距。
- **角色标签着色**：团长与派发卡片中的 `.eventRole` 使用基于 `@purple`（`color-mix(in srgb, ...)`）的浅紫底与混合文字色。

#### Scenario: 团长运行中展开过程并在结束后自动收起
- **WHEN** 传入携带 `process` 与 `conclusion` 的 `leader` 条目，先设置 `isStreaming: true`，随后切换为 `isStreaming: false`
- **THEN** 流式阶段过程内容直接展开可见；流式结束后过程内容进入默认收起的可折叠面板（`destroyInactivePanel`），下方紧接渲染 `conclusion`

#### Scenario: 派发节点与多段团员汇报兼容旧字段
- **WHEN** 同时渲染新格式（`dispatch` 含 `avatarUrl` 与缺省 `status`、`report` 含 `contents` 数组）与旧格式（仅传 `content` 字符串）的 `OpcTimelineEntry`
- **THEN** 新旧两种数据形态均可正确渲染，不出现空状态崩溃或类型错误

### Requirement: OpcAnswer 时间线页脚与进行中插槽
`OpcAnswerProps` SHALL 新增可选 `timelineFooter?: ReactNode` 与 `processing?: ReactNode`，并保留现有 `footer?: ReactNode` 兼容：
- 当传入 `timelineFooter` 时，在 `<ol className={styles.events}>` 末尾渲染 `<li className={styles.event} data-kind="footer">`，左侧轨道展示 `<InfoCircleOutlined />`，主体渲染 `timelineFooter`。
- 当传入 `processing` 时，在时间线与问答/错误区之后渲染并按事件正文列左缩进对齐（`.processingIcon`）。
- 仅传入旧 `footer`（如仅含推荐追问或旧接入方）时，继续在时间线外按原有 `.footer` 缩进展示，同时校验非空渲染条件包含 `timelineFooter != null || processing != null`。

#### Scenario: 完成结果入时间线末尾且加载图标对齐正文列
- **WHEN** 向 `OpcAnswer` 传入 `timelineFooter={<ChatCompletedResult ... />}`、`processing={<Spin />}` 与外部 `footer={<SuggestedQuestions ... />}`
- **THEN** `timelineFooter` 作为 `<ol>` 的最后一个 `<li data-kind="footer">` 随时间线纵轴连接展示，`processing` 与 `footer` 在时间线外按正文列对齐展示

### Requirement: OPC 文档与示例同步
`docs/guide/getting-started.md`、`docs/reference/content.md`、`docs/reference/opc.md`、`docs/sdk/components.md`、`docs/examples/message-content.tsx` 与 `docs/examples/opc-conversation.tsx` SHALL 同步更新，说明新增纯函数、`ToolExecutionCard`、新主题 CSS 变量、OPC 时间线新字段以及专家面板「流式时不套折叠、结束后折叠」的接入模式。

#### Scenario: 文档站点独立构建通过
- **WHEN** 后续完成实现并运行 `pnpm docs:build`（于适配 Node 22 环境）
- **THEN** 文档站构建成功且示例覆盖最新公开 API
