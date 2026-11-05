---
title: 子智能体
description: 子智能体列表、独立卡片与选择回调。
---

# 子智能体

`MultiSubAgentCard` 展示可折叠列表，`SubAgentListItem` 展示独立卡片。组件根据传入数据展示状态，点击时通过 onSelect 返回原始对象。

<code src="../examples/subagents.tsx"></code>

## API

以下组件均支持 `className?: string`、`style?: CSSProperties`。泛型 `T extends SubAgent` 保留附加字段。

### SubAgent

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | `string` | 是 | 唯一标识 |
| description | `string` | 否 | 任务描述 |
| random_number | `number` | 否 | 确定性黑白头像编号，支持 0，按 0–299 循环映射；自定义 avatar 优先 |
| prompt | `string` | 否 | 悬浮提示内容 |
| creating | `boolean` | 否 | 创建中状态 |
| excuting | `boolean` | 否 | 执行中状态，字段名按当前公开接口拼写 |

### MultiSubAgentCard

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| subagents | `readonly T[]` | 必填 | 子智能体列表；空数组显示创建中标题 |
| title | `ReactNode` | 按列表状态生成 | 列表标题 |
| onSelect | `(subagent: T) => void` | — | 选择回调 |
| renderSubAgent | `(subagent: T, index: number) => ReactNode` | — | 自定义卡片 |
| expanded | `boolean` | — | 受控展开状态 |
| defaultExpanded | `boolean` | `true` | 初始展开状态 |
| onExpandedChange | `(expanded: boolean) => void` | — | 展开变化回调 |
| ghost | `boolean` | `false` | 当前组件固定使用有边框面板 |

### SubAgentListItem

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| subagent | `T` | 必填 | 子智能体对象 |
| label | `ReactNode` | `'智能体'` | 卡片名称 |
| avatar | `ReactNode` | 机器人图标 | 自定义头像 |
| color | `string` | `'#a30030'` | 卡片边框与状态颜色 |
| prompt | `ReactNode` | `subagent.prompt` | 悬浮内容 |
| onSelect | `(subagent: T) => void` | — | 选择回调；无回调且无提示内容时禁用按钮 |
