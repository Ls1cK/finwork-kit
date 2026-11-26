---
title: 组件总览
description: 浏览 FinWork Kit 的组件示例与 API。
---

# 组件总览

组件从 `@lz19.02/finwork-kit/chat/ui` 导出，支持普通消息和 OPC 协作对话两类布局。

## 组件

所有组件通过 props、回调或渲染插槽接收数据。应用持有状态并负责接口调用和交互。需要把 SSE 或历史记录转为组件数据时，可使用 [SDK](/sdk/overview)。

### 从数据选组件

| 已有数据 | 用法 |
| --- | --- |
| 一条 Markdown 或代码字符串 | 完整文档用 `MarkdownViewer`。累积中的回答用 `StreamingMarkdownRenderer`。只显示代码用 `CodeViewer`，需要折叠和复制时用 `MarkdownCodeBlock`。 |
| 一轮普通回答的内容数组 | 用 `MessageContentList` 分发内容，外层可组合 `AiMessage`。只有一条回答正文时可直接用 `AssistantContent`。 |
| 同时有用户、助手和系统消息 | 页面按消息角色渲染对应组件，用消息 ID 作为列表 key。需要统一容器或插入页脚时用 `MessageItem`。 |
| OPC 轮次状态 | 把 SDK 时间线转成 `OpcTimelineEntry[]`，传给 `OpcAnswer`。详情入口回传执行 target，可据此组合 `OpcExpertPanel`。参见 [SDK 对接组件](/sdk/components)。 |
| 文件、状态和操作 | 把 `MessageFileList` 放进用户消息的 `files`，用 `OutputFilesCollapse` 渲染产出文件。用 `MessageActions`、`ChatCompletedResult` 和 `SuggestedQuestions` 组合回答下方的操作。 |

### 组件清单

按功能进入对应页面，每页均提供可运行示例、示例源码和 API 表格。

| 分类 | 示例与 API |
| --- | --- |
| 消息容器与角色布局 | [消息布局](/reference/messages) |
| 内容分发、正文、思考、工具与折叠 | [消息内容](/reference/content) |
| 子智能体卡片与列表 | [子智能体](/reference/subagents) |
| OPC 单轮时间线与专家执行面板 | [OPC 协作对话](/reference/opc) |
| 文件卡片、列表与输出区域 | [文件展示](/reference/files) |
| 自定义操作栏、追问与完成状态 | [消息操作](/reference/actions) |
| Markdown、代码块与引用 | [Markdown 与引用](/reference/markdown) |

| 组件 | 主要属性与职责 |
| --- | --- |
| `MessageItem` | `role`、`header`、`children`、`footer`，消息外层容器 |
| `UserMessage` | `content`、`files`、`extra`、`skillName`、`metadata`、`onCopy`，用户消息与长文本折叠 |
| `AiMessage` | `title`、`avatar`、`connecting`、`processing`、`error`、`children`、`output`、`footer`、`suggestions`，助手消息布局 |
| `SystemMessage` | `children`，系统消息展示 |
| `MessageContentList<T>` | `list`、`streamingAssistantContentId`、`renderers`、`renderItem`，内容列表与扩展 |
| `MessageContentItem<T>` | `item`、流式状态、`renderers`、`renderUnknown`，单项分发 |
| `AssistantContent` | `content`、`isStreaming`、`renderContent`，回答正文 |
| `ThinkContent` | 正文属性及 `title`、展开属性，思考内容 |
| `ToolCallMsg` | `label`、`detail`、`icon`、`isStreaming`、`children`，工具调用状态与补充内容 |
| `ToolCallResponse` | `content`、`renderContent`、展开属性，执行结果 |
| `ContextCompressContent` | `status`、`label`、`icon`，上下文压缩状态 |
| `AskUserQuestionContent` | `question`、`options`、`answer`，用户回答回显 |
| `MessageCollapse` | `title`、`children`、展开属性，通用折叠面板 |
| `TaskCompletedSplit` | `process`、`conclusion`、`title`、展开属性，过程与结论布局 |
| `MultiSubAgentCard<T>` | `subagents`、`title`、`onSelect`、`renderSubAgent`，子智能体列表 |
| `SubAgentListItem<T>` | `subagent`、`label`、`avatar`、`color`、`prompt`、`onSelect`，独立子智能体卡片 |
| `OpcAnswer` | `timeline`、`error`、`footer`、`onOpenExecution`，在统一消息列表中展示 OPC 回答 |
| `OpcTimeline` | `timeline`、`onOpenExecution`，单独展示团长回复、任务派发和团员回传 |
| `OpcRound` | `timeline`、`userMessage`、`footer`、`onOpenExecution`，独立展示一轮 OPC 对话 |
| `OpcExpertPanel` | `members`、`memberId`、`tasks`、`taskId`、选择回调和正文插槽，专家执行详情 |
| `OpcAvatar` | `role`、`src`、`size`，团长或团员头像 |
| `OpcStatus` | `status`、`label`、`action`，执行状态及可选的详情入口 |
| `MessageFileCard<T>` | `file`、`title`、`icon`、`actions`、`onPreview`、`onDownload`、`downloading`，单文件卡片 |
| `MessageFileList<T>` | `files`、`renderFile`、`getFileKey`、`onPreview`，横向文件列表 |
| `SkillOutputCard<T>` | 文件卡片属性及 `isSkillDebugTask`，技能文件卡片 |
| `OutputFilesCollapse<T>` | `outputFiles`、`skillFiles`、`packageFile`、`renderSkill`、预览与下载回调，输出文件区 |
| `MessageActions` | `actions`、`children`，按钮组，支持自定义图标、选中、禁用和加载状态 |
| `SuggestedQuestions` | `questions`、`title`、`disabled`、`onSelect`，推荐追问 |
| `ChatCompletedResult` | `status`、`message`、`actions`、`usage`、`children`，完成状态与操作区域 |
| `MarkdownViewer` | `content`、`overrides`、`options`、`showImage`、`onMeta`、`onCopy`，通用 Markdown 展示 |
| `StreamingMarkdownRenderer` | `content`、`isStreaming`、`refAnchors`、`renderReference`、`overrides`、`onCopy`，平滑流式 Markdown |
| `StreamingTextRenderer` | `content`、`isStreaming`，平滑流式纯文本 |
| `MarkdownCodeBlock` | `code`、`language`、`expanded`、`onExpandedChange`、`onCopy`，折叠代码块及复制 |
| `CodeViewer` | `content`、`language`，按行缓存、延迟高亮与安全文本回退 |
| `ReferenceAnchor` | `anchor`、`title`、`contents`，引用来源卡片和分页 |

所有组件的 props 类型从同一入口导出。消息容器支持 `className` 和 `style`，具体组件以其公开 props 为准。列表和单项分发使用 Fragment，外层样式可由调用方容器提供。

### 内容扩展

`MessageContent` 只定义 UI 读取的最小字段，至少包含 `id` 和 `type`。泛型 `T extends MessageContent` 保留调用方附加的业务字段，`MessageContentRenderers<T>` 中的 `item` 使用同一个 `T`。

- `renderers` 按 `item.type` 匹配。既可覆盖内置类型，也可增加业务自定义类型，回调返回 `null` 可隐藏该项。
- `renderItem(props, defaultContent)` 可包裹或替换任意一项。选中、审计、额外按钮等逻辑可在宿主完成，并复用默认内容。
- `renderUnknown` 负责未识别类型的回退展示，缺省时隐藏该项。
- 单独导出的内容组件可直接组合，允许使用方自行编排内容。

下面展示默认回答与业务自定义条目共存的方式，业务字段通过泛型保留。

<code src="../examples/content-extension.tsx"></code>

默认分发支持 `THINK_MSG`、`ASSISTANT_MSG`、`TOOL_CALL`、`TOOL_RESPONSE`、`SUBAGENTS`、`CONTEXT_COMPRESS`、`ASK_USER_QUESTION`。工具调用显示名称、状态和可用的参数、输出，MCP 调用还显示服务名。独立的工具结果默认展示 Bash 字符串结果。自定义工具文案和结果通过 `renderers` 接入，详见[消息内容](/reference/content)。

`AssistantContent` 缺省通过 `StreamingMarkdownRenderer` 渲染回答，思考内容缺省通过 `StreamingTextRenderer` 渲染。提供 `renderContent(content, isStreaming)` 可整体接管正文。内容列表和单项分发也接收 `renderContent`，原有 `renderMarkdown` 继续兼容，优先使用 `renderContent`。

默认正文链路为 `AssistantContent → StreamingMarkdownRenderer → MarkdownViewer → MarkdownCodeBlock → CodeViewer`。通用 Markdown 保留表格、列表、引用块、front matter、图片降级和代码高亮。流式渲染保留不完整 Markdown 修复、MCP 名称保护、纯文本快速路径和平滑输出，并默认隐藏图片。`overrides` 支持定制具体标签，原始 HTML 解析保持关闭。

`refAnchors` 提供当前内容的引用编号，`renderReference(anchor)` 接管来源标记。`buildRefAnchorsByContentId` 按整轮回答的出现顺序计算编号，相同来源多次出现会获得不同编号。`ReferenceAnchor` 接收 `ReferenceDisplayItem` 展示来源标题、正文、链接、来源和发布时间。

`onCopy(text)` 可接入宿主复制动作，缺省时代码块使用浏览器剪贴板并提供兼容回退。引用业务映射、路由和数据请求由宿主负责。

### 展开状态与过程拆分

`ThinkContent`、`ToolCallResponse`、`MessageCollapse`、`MultiSubAgentCard` 使用 `expanded`、`defaultExpanded`、`onExpandedChange`。提供 `expanded` 时由调用方控制，其他场景由组件维护本地展开状态。

内容列表通过 `contentExpandedMap` 和 `onContentExpandedChange(key, expanded)` 管理各项展开状态。`getContentCollapseKey(item)` 返回原组件兼容的 `${item.id || item.msg_content_id}_${item.type}`。可直接复用已有展开记录。

列表接收 `conclusionId` 后，将对应的 `msg_content_id || id` 抽出为结论，其余内容按原顺序进入过程面板。`processTitle` 可传入格式化后的耗时，`processExpanded`、`defaultProcessExpanded`、`onProcessExpandedChange` 控制过程面板。未找到对应项时按原顺序展示。过程和结论均使用同一套渲染扩展入口。

任务完成、落库、最新回答、是否展示推荐追问等业务条件，由宿主判断并转换成上述属性。

### 文件与动作

文件模型只要求 `fileName`，可附带 `fileId` 及任意业务字段。文件列表默认以 `fileId ?? fileName` 为 key，同名文件可通过 `getFileKey` 提供唯一值。下载和预览回调收到原始文件对象。`downloading` 和操作栏中的 `loading` 由宿主管理。

点赞点踩等操作通过 `MessageActions` 配置。业务反馈表单、弹窗、理由、文案、接口与提交状态由宿主负责，案例见[消息操作](/reference/actions)。

### 环境与样式

React/react-dom（`^18.3.1`）、Ant Design（`^4.24.8`）与图标（`^4.8.3`）通过 peerDependencies 共享宿主实例。其他实现依赖由 Kit 自动安装。Kit 沿用宿主外层 ConfigProvider，自有颜色通过 CSS 变量配置。

使用方在应用入口导入宿主 Ant Design 主题与 `@lz19.02/finwork-kit/chat/style.css`，Kit CSS 仅含作用域内的组件和高亮样式。Kit 提供编译后的 CSS，内部使用 CSS Modules + Less。主题变量、弹层继承及静态 CSS 加载方式见[快速开始](/guide/getting-started#宿主配置与主题)。当前为单包发布，core 的运行与类型入口保持纯逻辑隔离。

## 如何开始

首次使用请前往[快速开始](/guide/getting-started)。
