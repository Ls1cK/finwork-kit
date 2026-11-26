---
title: 介绍
description: FinWork Kit 的组件、样式和 SDK 入口。
---

# 介绍

FinWork Kit 是一个 TypeScript 包，提供 React 对话组件及处理 SSE 事件和历史记录的纯函数。组件与 SDK 可以独立使用。

| 公开入口 | 用途 |
| --- | --- |
| `chat/ui` | 消息布局、Markdown、代码块、引用、文件卡片和 OPC 时间线 |
| `chat/style.css` | 组件样式，从应用入口加载 |
| `chat/core-sse` | 解码事件，归并普通或 OPC 对话状态 |
| `chat/core-detail` | 解析历史帧，恢复轮次状态 |

应用负责请求、状态存储和回调。安装和样式配置见[快速开始](/guide/getting-started)。按需查阅[组件 API](/reference/overview)和 [SDK 指南](/sdk/overview)。
