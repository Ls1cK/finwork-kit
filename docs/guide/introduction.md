---
title: 介绍
description: 了解 FinWork Kit 的定位与适用场景。
---

# 介绍

FinWork Kit 是面向金融与办公智能体应用的组件与 SDK 库。

FinWork 是面向金融与办公场景的专业级任务执行智能体产品，产品形态类似 Codex、Manus。FinWork Kit 面向应用开发者，提供配套的界面组件与接入能力，让任务交互、执行过程和交付结果的呈现更加一致。

## 适用场景

- 在应用中构建智能体任务对话界面。
- 展示任务执行过程与结果。
- 接入 FinWork 相关能力，构建金融与办公场景的智能体应用。

v0.1.0 已提供上述场景中的消息展示与交互组件。任务请求、流式数据接收与历史数据解析由宿主应用负责。

## 文档导航

| 入口 | 你可以了解 |
| --- | --- |
| [快速开始](/guide/getting-started) | 如何安装并完成首次使用 |
| [组件](/reference/overview) | 组件能力、使用示例和 API |
| [SDK](/sdk/overview) | SDK 模块能力与当前状态 |

## 当前状态

v0.1.0 是首个可用 UI 版本，提供 29 个消息、文件、操作、Markdown 和代码展示组件。组件通过显式 props、回调和渲染插槽组合。

正文默认使用流式 Markdown 渲染，支持通过 `renderContent` 接管展示。内容分发支持自定义消息类型与单项包装，组件清单和使用示例见[组件](/reference/overview)。

SSE 与历史解析能力继续开发，模块状态见 [SDK](/sdk/overview)。
