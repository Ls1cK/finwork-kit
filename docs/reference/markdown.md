---
title: Markdown 与引用
description: Markdown、流式文本、代码块与引用来源的用法。
---

# Markdown 与引用

`MarkdownViewer` 展示完整 Markdown，`StreamingMarkdownRenderer` 平滑展示累积中的 Markdown，`StreamingTextRenderer` 展示流式纯文本。每次更新 content 时传入当前完整内容。

<code src="../examples/markdown.tsx"></code>

## 接入引用来源

1. 在回答文本中保留 `[来源](#ref:ID)`，让 `ID` 对应来源数据的 `referenceId`。
2. 使用 `MessageContentList` 时，列表按整轮回答计算编号。直接使用 `StreamingMarkdownRenderer` 时，用 `buildRefAnchorsByContentId(list)` 计算编号，并把当前条目对应的数组传入 `refAnchors`。
3. `renderReference(anchor)` 按 `anchor.referenceId` 查来源，再渲染 `ReferenceAnchor`。同一个来源出现两次会显示不同编号，但可以查到同一份来源数据。来源为空时可返回 `null`。
4. 引用文本处于行内代码或代码围栏中时按字面展示。流式正文传入累计文本，组件会处理尚未闭合的 Markdown。

## API

### MarkdownViewer

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | 必填 | Markdown 正文 |
| onCopy | `(text: string) => void \| Promise<void>` | — | 接管代码块复制 |
| overrides | `MarkdownToJSX.Options['overrides']` | — | 定制标签渲染，覆盖同名内置配置 |
| options | `Omit<MarkdownToJSX.Options, 'overrides' \| 'disableParsingRawHTML'>` | `{}` | Markdown 解析配置，原始 HTML 解析固定关闭 |
| onMeta | `(meta: Record<string, unknown>) => void` | — | 收到非空 YAML front matter 元数据，正文中自动移除元数据 |
| showImage | `boolean` | `true` | 是否展示图片 |
| extraPreprocess | `(content: string) => string` | — | 在基础预处理前处理正文 |
| docMarkdown | `boolean` | `false` | 启用文档展示样式 |
| skipFrontMatter | `boolean` | `false` | 跳过开头 YAML front matter 剥离，保留 `---` 开头正文 |

`MarkdownToJSX` 类型来自 `markdown-to-jsx`。表格、列表、引用块与代码高亮均可直接使用。

### StreamingMarkdownRenderer

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | 必填 | 当前累积的完整 Markdown |
| isStreaming | `boolean` | `false` | 是否正在流式输出 |
| refAnchors | `MessageReferenceAnchor[]` | — | 当前内容中的引用编号，按出现顺序传入 |
| renderReference | `(anchor: MessageReferenceAnchor) => ReactNode` | — | 自定义引用标记 |
| onCopy | `(text: string) => void \| Promise<void>` | — | 接管代码块复制 |
| overrides | `MarkdownToJSX.Options['overrides']` | — | 标签渲染定制；自定义 a 会覆盖引用链接渲染 |

默认隐藏图片并跳过 front matter 剥离，保留不完整 Markdown 修复与平滑输出。引用标记使用 `[来源](#ref:ID)`（左括号 `(（【[`、右括号 `)）]】` 任意组合，兼容 `#ref=`、`#ref：`，收尾可多一个右括号，统一归一化），可通过 `buildRefAnchorsByContentId` 为一轮回答生成编号，或由 `MessageContentList` 自动计算。

### StreamingTextRenderer

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | 必填 | 当前累积的完整纯文本 |
| isStreaming | `boolean` | `false` | 是否流式输出，输出中显示光标 |

### MarkdownCodeBlock

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| code | `string` | 必填 | 代码正文 |
| language | `string` | 必填 | 高亮语言 |
| title | `ReactNode` | `language` | 代码面板标题 |
| defaultExpanded | `boolean` | `true` | 非受控初始展开状态 |
| className / style | `string / CSSProperties` | — | 外层样式 |
| renderContent | `(code: string) => ReactNode` | — | 自定义代码正文展示 |
| expanded | `boolean` | — | 受控展开状态。在 `onExpandedChange` 中更新 |
| collapseKey | `string` | `'code'` | 内部折叠组件 key，变化时重置内部状态 |
| onExpandedChange | `(expanded: boolean) => void` | — | 展开变化回调 |
| onCopy | `(text: string) => void \| Promise<void>` | 浏览器剪贴板及兼容回退 | 接管复制动作 |

直接渲染代码时传入原始字符串和语言名。Markdown 围栏由 `MarkdownViewer` 自动渲染为 `MarkdownCodeBlock`。代码块默认展开，想默认收起时传 `defaultExpanded={false}`。需要在不同代码片段间重置非受控折叠状态时，更新 `collapseKey`。折叠头沿用宿主 Ant Design 的 Collapse 内边距，点击复制按钮保持当前展开状态。

### CodeViewer

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `string` | — | 代码正文，优先于 children |
| language | `string` | — | 高亮语言，优先于 className 推导值 |
| children | `string` | `''` | 未传 content 时的正文 |
| className | `string` | — | 兼容 Markdown 注入的 lang-* 语言标记；无语言时使用 plaintext |

### ReferenceAnchor

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| anchor | `MessageReferenceAnchor` | 必填 | `{ referenceId: string; idx: number }`，idx 为显示编号 |
| title | `string` | 必填 | 来源卡片标题 |
| contents | `readonly ReferenceDisplayItem[]` | 必填 | 来源列表，为空时隐藏编号，多条时支持分页 |

#### ReferenceDisplayItem

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| title | `string` | 否 | 单条来源标题 |
| content | `string` | 否 | 来源正文 |
| url | `string` | 否 | 原文链接 |
| source | `string` | 否 | 来源名称 |
| publishedAt | `string` | 否 | 发布时间展示文本 |

### 引用辅助函数

以下案例直接展示各辅助函数的返回值，包括同一来源重复出现时的独立编号。

<code src="../examples/markdown-helpers.tsx"></code>

均从 `@lz19.02/finwork-kit/chat/ui` 导入。`ReferenceContent` 包含可选的 `id`、`msg_content_id`、`type`、`content` 字符串字段。

| 函数 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| extractRefIdsFromText | `text: string` | `string[]` | 按出现顺序提取引用 ID（自动跳过围栏代码块与行内代码） |
| buildRoundRefAnchors | `contentList: readonly ReferenceContent[] \| undefined` | `MessageReferenceAnchor[]` | 仅统计 ASSISTANT_MSG，从 1 连续编号；重复来源分别编号 |
| buildRefAnchorsByContentId | `contentList: readonly ReferenceContent[] \| undefined` | `Record<string, MessageReferenceAnchor[]>` | 按 msg_content_id 或 id 分组，编号跨内容连续 |
| replaceRefAnchorsWithIdx | `text: string, anchors: MessageReferenceAnchor[]` | `string` | 按出现顺序将非代码正文中的来源标记替换为对应编号 |

### Markdown 预处理辅助函数

均从 `@lz19.02/finwork-kit/chat/ui` 导入，用法与返回结果见上方辅助函数案例。默认渲染链路已调用对应函数，直接使用组件时无需重复预处理。

| 函数 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| extractFrontMatter | `rawContent: string` | `FrontMatterResult` | 提取开头 YAML 元数据并移除头部块，返回 `{ meta, content }`；无头部块时保留正文，YAML 解析失败时 meta 为空且头部块仍被移除 |
| preprocessMarkdown | `rawContent: string` | `string` | 补齐未闭合代码围栏，移除末尾不完整图片、链接、行内代码或 HTML 标签片段 |
| preprocessStreamingExtra | `rawContent: string` | `string` | 补齐末尾来源链接，转义加粗 MCP 工具名内的双下划线 |
| preprocessStreamingMarkdown | `rawContent: string` | `string` | 先执行流式额外处理，再执行基础 Markdown 预处理 |
