---
title: OPC 协作对话
description: 组合团长回复、任务派发、团员回传和专家执行详情。
---

# OPC 协作对话

`MessageItem` 支持 `role="opc_assistant"`。宿主在该角色的消息中组合 `OpcAnswer`，按顺序展示协作回复。点击任务状态可打开 `OpcExpertPanel`，随后可以切换专家及其任务。

<code src="../examples/opc-conversation.tsx"></code>

## OpcAnswer

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| timeline | `readonly OpcTimelineEntry[]` | 必填，按展示顺序排列 |
| contentList | `readonly MessageContent[]` | 从统一消息传入公共内容，`ASK_USER_QUESTION` 在时间线下方复用普通消息的问答回显 |
| error | `string` | 错误信息，可传入 `message.chatError?.message` |
| footer | `ReactNode` | 使用宿主共用的文件、完成结果、反馈和推荐追问组件 |
| onOpenExecution | `(target: OpcExecutionTarget) => void` | 点击执行状态。省略时状态仅展示 |
| className、style | `string`、`CSSProperties` | 外层样式 |

`OpcTimelineEntry` 按 `kind` 区分三类事件。每项需要一个在本轮内唯一、更新时稳定的 `id`。

| kind | 数据 |
| --- | --- |
| `leader` | `name` 必填，`avatarUrl`、Markdown `content` 和 `isStreaming` 可选。空的流式块显示「正在回复」 |
| `dispatch` | `assignments` 为 `OpcDispatch[]`。每项传入本组唯一的 `id`、`member`、`status`，可选 `avatarUrl` 和可展开的 `prompt` |
| `report` | `name`、`status`、`target` 必填，`avatarUrl`、Markdown `content` 和 `note` 可选 |

时间线中的 `status` 是 `{ status: OpcStatusKind, label: string }`。`OpcExecutionTarget` 由 `kind: 'assignment' | 'reply'` 和 `id: string` 组成。派发项返回自己的 assignment ID，回传项返回宿主指定的 target，可指向关联派发或独立回复。

## OpcTimeline

`OpcTimeline` 只展示有序事件，接受 `timeline`、`onOpenExecution`、`className` 和 `style`。可嵌入已有的回答容器。

## OpcRound

`OpcRound` 独立展示单轮协作。它接受 `OpcAnswer` 的属性和以下属性。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| id | `string` | 轮次锚点，同时写入 `id` 和 `data-chat-row-id` |
| userMessage | `ReactNode` | 用户消息，可传入 `UserMessage` |

## OpcExpertPanel

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| members | `readonly OpcExpertMember[]` | 必填，专家包含 `id`、`name` 和可选的 `avatarUrl` |
| memberId | `string` | 当前专家 ID |
| onMemberChange | `(id: string) => void` | 必填，宿主更新专家、任务列表和选中任务 |
| tasks | `readonly OpcExpertTask[]` | 必填，当前专家的任务列表，每项包含 `id` 和可选的 `prompt` |
| taskId | `string` | 当前展示任务 ID。缺少有效专家或任务时展示空态 |
| onTaskChange | `(id: string) => void` | 必填，宿主更新当前任务和正文 |
| status | `{ status: OpcStatusKind, label: string }` | 当前执行状态 |
| headerAction | `ReactNode` | 关闭按钮等宿主动作 |
| scrollRef、contentRef | `Ref<HTMLDivElement>` | 可选，分别取得滚动视口和内容容器，用于接入宿主滚动策略 |
| children | `ReactNode` | 执行过程、结论、等待提示等 |
| className、style | `string`、`CSSProperties` | 外层样式 |

执行过程可组合 `TaskCompletedSplit` 与 `MessageContentList`。传入 `expanded` 和 `onExpandedChange` 可按任务存储展开状态。传入 `destroyInactivePanel` 可在收起过程后卸载内容，适合流式过程较长的场景。

## OpcAvatar 与 OpcStatus

| 组件 | 属性 |
| --- | --- |
| `OpcAvatar` | `role` 为 `'leader'\|'worker'`，默认 `'worker'`。可传入 `src` 和数值 `size`，默认 32。无头像时显示对应角色图标 |
| `OpcStatus` | `status` 和 `label` 必填。提供 `action: { member, onClick }` 时使用可聚焦按钮展示详情入口 |

`OpcStatusKind` 支持 `idle`、`started`、`running`、`completed`、`success`、`error`、`cancelled`、`timeout`、`uncompleted`。状态文案由宿主提供，颜色沿用 [Kit 主题变量](/guide/getting-started#宿主配置与主题)。

## 接入 OPC 数据

1. 流式帧和历史记录使用同一套消息结构。FinPlus 将 OPC 回答标为 `opc_assistant`，把有序事件、派发与回复索引和协作总结保存到 `message.opcTimeline`。
2. 按 `role` 选择正文组件。将 `message.opcTimeline` 投影为 `OpcTimelineEntry[]` 并传给 `OpcAnswer`。仅对当前流式团长块传入 `isStreaming`。有总结且没有团长正文时，可追加一条团长事件。
3. 在 `onOpenExecution` 中用消息 ID 或运行 ID 与 target 定位任务。把已选专家、任务及其执行内容传给面板。切换任务后可用任务标识重置滚动和展开区状态。
4. 从消息的共用字段提供错误和页脚。FinPlus 把执行用量和完成态保存在 `contentList`，文件、反馈、推荐追问沿用原有字段。分享、权限和下载由宿主实现。

运行中的追问输入由宿主按 `pendingQuestion` 提供。追问卡片展示本轮的题目和已选或已填写答案。运行中的专家状态与工具调用使用扫光动效，思考标题采用文字扫光与逐点动画，系统偏好减少动态效果时静态展示。
