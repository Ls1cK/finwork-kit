---
title: 消息内容
description: 内容分发、正文、思考、工具调用和折叠面板。
---

# 消息内容

使用 `MessageContentList` 按类型展示内容，也可以直接组合各内容组件。

以下示例展示全部七种内置内容类型，以及各内容组件的独立用法。工具调用组件导出名为 `ToolCallMsg`，对应内容类型 `TOOL_CALL`；工具结果使用 `ToolCallResponse`。子智能体组件的独立用法见[子智能体](/reference/subagents)。

<code src="../examples/message-content.tsx"></code>

## API

除使用 Fragment 的 `MessageContentList`、`MessageContentItem` 外，以下组件均支持 `className?: string`、`style?: CSSProperties`。

### 共用展开属性

`ThinkContent`、`ToolCallResponse`、`MessageCollapse`、`TaskCompletedSplit` 支持以下属性。传入 `expanded` 后，调用方需在回调中更新它。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| expanded | `boolean` | — | 受控展开状态 |
| defaultExpanded | `boolean` | `false` | 非受控初始展开状态 |
| onExpandedChange | `(expanded: boolean) => void` | — | 展开状态变化回调 |

### MessageContent

`T extends MessageContent` 可保留调用方的附加字段。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | `string` | 是 | 内容标识 |
| type | `string` | 是 | 内容类型，也用于匹配 renderers |
| msg_content_id | `string` | 否 | 消息内容标识，流式匹配与结论拆分时优先于 id |
| content | `string` | 否 | 回答或思考正文 |
| output | `string` | 否 | 工具执行结果 |
| tool_call_name / tool_result_name | `string` | 否 | 工具调用名称 / 结果名称 |
| contextCompressStatus | `'unfinished' \| 'success' \| 'failed'` | 否 | 上下文压缩状态 |
| question | `string` | 否 | 提问内容 |
| options | `readonly { id: string; text: string }[]` | 否 | 提问选项 |
| userAnswer | `{ optionId?: string; userMessage?: string }` | 否 | 回答回显 |
| subAgentRenderConfig | `{ subAgentList: readonly SubAgent[] }` | 否 | 子智能体列表，结构见[子智能体](/reference/subagents) |

### MessageContentItem

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| item | `T` | 必填 | 内容对象 |
| isStreaming | `boolean` | `false` | 当前条目是否正在输出 |
| isAnswerStreaming | `boolean` | — | 整轮回答是否正在输出 |
| isLatestContextCompress | `boolean` | — | 是否为最后一条压缩记录，与整轮流式状态共同决定压缩中状态 |
| renderers | `MessageContentRenderers<T>` | — | 按 type 覆盖或扩展渲染，返回 null 隐藏条目 |
| renderUnknown | `(props: MessageContentItemRenderProps<T>) => ReactNode` | — | 未识别类型的回退，默认隐藏 |
| renderContent | `(content: string, isStreaming: boolean) => ReactNode` | — | 接管回答正文 |
| renderMarkdown | `MessageTextRenderer` | — | 兼容属性，renderContent 优先 |
| renderText | `MessageTextRenderer` | — | 接管思考正文 |
| contentExpandedMap | `Readonly<Record<string, boolean>>` | — | 各内容项的展开状态 |
| onContentExpandedChange | `(key: string, expanded: boolean) => void` | — | 内容展开变化，key 由 getContentCollapseKey 生成 |
| onSubAgentSelect | `(subagent: SubAgent, item: T) => void` | — | 子智能体选择回调 |

`MessageTextRenderer` 为 `(content: string, isStreaming: boolean) => ReactNode`。`MessageContentRenderers<T>` 为按类型名索引的可选渲染函数集合，每个函数接收 `MessageContentItemRenderProps<T>`，即上表中除 `renderers`、`renderUnknown` 外的属性。

默认支持 `THINK_MSG`、`ASSISTANT_MSG`、`TOOL_CALL`、`TOOL_RESPONSE`、`SUBAGENTS`、`CONTEXT_COMPRESS` 和 `ASK_USER_QUESTION`。`TOOL_RESPONSE` 默认仅展示 `tool_result_name === 'Bash'` 的结果，其他工具可通过 renderers 定制。

### MessageContentList

继承 `MessageContentItem` 的渲染和展开属性，但不接收 `item`、`isStreaming`、`isAnswerStreaming`、`isLatestContextCompress`，这四项由列表计算。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| list | `readonly T[]` | 必填 | 按顺序展示的内容 |
| streamingAssistantContentId | `string` | — | 当前流式内容的 msg_content_id 或 id |
| getItemKey | `(item: T) => string` | `getContentKey` | 条目的 React key |
| renderItem | `(props: MessageContentItemProps<T>, defaultContent: ReactNode) => ReactNode` | — | 包裹或替换任意条目 |
| conclusionId | `string` | — | 匹配 msg_content_id 或 id 后抽出结论，其余条目进入过程面板；未找到时保持原顺序 |
| processTitle | `ReactNode` | `'执行过程'` | 过程面板标题 |
| processExpanded | `boolean` | — | 过程面板受控展开状态 |
| defaultProcessExpanded | `boolean` | `false` | 过程面板初始展开状态 |
| onProcessExpandedChange | `(expanded: boolean) => void` | — | 过程展开变化回调 |

### AssistantContent

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | 必填 | 正文，去除首尾空白后为空则隐藏 |
| isStreaming | `boolean` | `false` | 流式输出状态，传入当前累积的完整正文 |
| renderContent | `MessageTextRenderer` | — | 整体替换正文渲染 |
| refAnchors / renderReference / onCopy / overrides | 同 `StreamingMarkdownRenderer` | — | 默认 Markdown 渲染的引用、复制和标签定制属性 |

### ThinkContent

支持共用展开属性。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | 必填 | 思考正文，默认按流式纯文本渲染 |
| isStreaming | `boolean` | `false` | 流式输出状态 |
| title | `ReactNode` | 按流式状态生成 | 默认“正在思考中...”或“已完成思考” |
| renderContent | `MessageTextRenderer` | — | 替换思考正文渲染 |

### ToolCallMsg

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| label | `ReactNode` | 必填 | 工具名称或状态文案 |
| detail | `ReactNode` | — | 补充摘要 |
| isStreaming | `boolean` | `false` | 显示执行中状态 |
| icon | `ReactNode` | 按流式状态生成 | 自定义状态图标 |
| children | `ReactNode` | — | 状态卡片后的内容 |

### ToolCallResponse

支持共用展开属性。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | 必填 | 执行结果，空字符串时隐藏 |
| title | `ReactNode` | `'执行结果'` | 面板标题 |
| renderContent | `(content: string) => ReactNode` | — | 自定义结果展示，默认使用 shell 高亮代码面板 |
| onCopy | `(text: string) => void \| Promise<void>` | 浏览器剪贴板及兼容回退 | 接管结果复制 |

### ContextCompressContent

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| status | `'unfinished' \| 'compressing' \| 'success' \| 'failed'` | 必填 | 压缩状态 |
| label | `ReactNode` | 按状态生成 | 自定义文案 |
| icon | `ReactNode` | 按状态生成 | 自定义图标 |

### AskUserQuestionContent

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| question | `string` | 必填 | 提问内容 |
| options | `readonly { id: string; text: string }[]` | `[]` | 只读选项 |
| answer | `{ optionId?: string; userMessage?: string }` | — | 回显已选项和补充回答；两者均为空时隐藏组件 |

### MessageCollapse

支持共用展开属性。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| title | `ReactNode` | 必填 | 折叠标题 |
| children | `ReactNode` | — | 折叠正文 |
| ghost | `boolean` | `true` | 透明无边框样式 |
| arrowPlacement | `'start' \| 'end' \| 'inline'` | `'start'` | 箭头置于开头、末尾或标题文字之后 |
| extra | `ReactNode` | — | 标题附加操作区域 |

### TaskCompletedSplit

支持共用展开属性及 `ghost`，结论始终显示在过程面板之后。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| title | `ReactNode` | 必填 | 过程面板标题 |
| process | `ReactNode` | 必填 | 可折叠的过程内容 |
| conclusion | `ReactNode` | 必填 | 结论内容 |

## 自定义内容

通过泛型保留附加字段，并以 renderers 扩展类型。

以下案例同时展示 `renderUnknown` 回退、`conclusionId` 过程与结论拆分，以及通过 `getContentCollapseKey` 初始化并更新受控展开状态。`getContentKey` 用于生成列表条目的 React key。

<code src="../examples/content-extension.tsx"></code>
