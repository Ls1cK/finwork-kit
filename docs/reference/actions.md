---
title: 消息操作
description: 自定义消息操作、推荐追问与完成状态。
---

# 消息操作

通过 `MessageActions` 配置按钮、图标、选中状态和点击回调。点赞点踩的业务反馈表单、弹窗、接口和提交状态由宿主实现。

案例展示自定义点赞点踩操作和四种完成状态，点击后仅更新案例中的选中状态与回调提示。

<code src="../examples/message-actions.tsx"></code>

## API

以下组件均支持 `className?: string`、`style?: CSSProperties`。

### MessageActions

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| actions | `readonly MessageAction[]` | 必填 | 按顺序显示的操作 |
| children | `ReactNode` | — | 附加操作区域 |

#### MessageAction

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| key | `string` | 是 | 唯一标识 |
| label | `string` | 是 | 提示与可访问名称，无图标时也用作按钮文字 |
| onClick | `() => void` | 是 | 点击回调 |
| icon | `ReactNode` | 否 | 操作图标 |
| active | `boolean` | 否 | 选中状态 |
| loading | `boolean` | 否 | 加载状态 |
| disabled | `boolean` | 否 | 禁用状态 |

### SuggestedQuestions

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| questions | `readonly string[]` | 必填 | 推荐问题，为空时隐藏 |
| title | `ReactNode` | `'推荐追问'` | 区域标题 |
| disabled | `boolean` | `false` | 禁用所有问题按钮 |
| onSelect | `(question: string) => void` | 必填 | 点击问题回调 |

### ChatCompletedResult

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| status | `'success' \| 'error' \| 'timeout' \| 'uncompleted'` | — | 完成状态图标与样式 |
| message | `ReactNode` | — | 状态文案 |
| actions | `ReactNode` | — | 操作区域 |
| usage | `readonly ReactNode[]` | `[]` | 耗时、用量等信息 |
| children | `ReactNode` | — | 补充内容 |

