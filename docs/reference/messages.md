---
title: 消息布局
description: 用户、助手、系统消息与消息容器的用法。
---

# 消息布局

组合 `MessageItem`、`UserMessage`、`AiMessage` 和 `SystemMessage` 展示不同角色的消息。

<code src="../examples/message-layout.tsx"></code>

## API

以下组件均支持 `className?: string` 和 `style?: CSSProperties`。

### MessageItem

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| role | `'user' \| 'assistant' \| 'system'` | 必填 | 消息角色，写入容器的 `data-message-role` |
| header | `ReactNode` | — | 顶部内容 |
| children | `ReactNode` | — | 消息正文 |
| footer | `ReactNode` | — | 底部内容 |

### UserMessage

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| content | `ReactNode` | — | 用户消息正文，超过 320px 时提供折叠入口 |
| skillName | `string` | — | 正文前的技能名称，自动添加 `@` |
| files | `ReactNode` | — | 正文前的文件区域 |
| extra | `ReactNode` | — | 文件区域后的补充内容 |
| metadata | `ReactNode` | — | 正文后的元信息 |
| onCopy | `() => void` | — | 提供后显示复制按钮 |
| expanded | `boolean` | — | 受控展开状态 |
| defaultExpanded | `boolean` | `false` | 非受控初始展开状态 |
| onExpandedChange | `(expanded: boolean) => void` | — | 展开状态变化回调 |

### AiMessage

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| title | `ReactNode` | `'FinWork'` | 助手名称 |
| avatar | `ReactNode` | — | 助手头像，连接中显示加载图标 |
| connecting | `boolean` | `false` | 是否正在连接 |
| processing | `boolean` | `false` | 是否正在处理，处理时以指示器替换 footer |
| processingIndicator | `ReactNode` | 加载图标 | 处理状态指示器 |
| error | `ReactNode` | — | 错误内容，有值时显示错误区域并隐藏 footer 与 suggestions |
| children | `ReactNode` | — | 消息正文 |
| output | `ReactNode` | — | 正文后的输出区域 |
| footer | `ReactNode` | — | 操作或完成状态区域 |
| suggestions | `ReactNode` | — | 推荐追问区域 |

### SystemMessage

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| children | `ReactNode` | — | 系统提示内容 |
