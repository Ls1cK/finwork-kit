---
title: 快速开始
description: 安装 FinWork Kit 并接入对话组件。
---

# 快速开始

本页介绍如何安装依赖并渲染第一条消息。已有状态数据时可以直接使用组件。处理 SSE 或历史记录时再接入 [SDK](/sdk/overview)。

## 安装

请确认项目配置的 npm 源已提供 FinWork Kit，然后在应用项目中安装。以下命令使用该 npm 源的 `latest` 标签。

```bash
pnpm add @lz19.02/finwork-kit
```

## UI 依赖

新项目建议使用以下已验证的 React 版本。React 与 React DOM 通过 peerDependencies 与宿主共享，当前兼容范围为 `^18.3.1`。

```bash
pnpm add react@18.3.1 react-dom@18.3.1 antd@4.24.8 @ant-design/icons@4.8.3
```

应用已有兼容版本时可直接复用。React、React DOM、Ant Design v4 和图标库与宿主共享实例。Markdown 解析、YAML、代码高亮等实现依赖随 Kit 安装。`chat/core-sse` 和 `chat/core-detail` 可以在 Node ESM 中直接导入，运行时无需加载 UI 或 CSS。

## 首次使用

在应用入口加载宿主的 Ant Design 主题和 Kit 编译后的 CSS，随后挂载应用。Kit CSS 包含作用域内的组件和代码高亮样式。

在应用入口静态导入两份样式。使用 Ant Design 默认主题时可以直接复制下面两行。已有主题的项目将第一行替换为自己的样式入口。

```tsx | pure
import 'antd/dist/antd.css';
import '@lz19.02/finwork-kit/chat/style.css';
```

将下面的示例组件挂载到应用中。示例传入了一条用户消息、一个思考块和一个 Markdown 回答。应用已有数据时，将每条内容映射为至少包含 `id` 和 `type` 的对象，保持同一条内容的 ID 在更新前后稳定。

<code src="../examples/messages.tsx"></code>

即使消息模块通过 `lazy()` 加载，样式也应先于它加载，避免首次渲染后折叠头、箭头和间距跳变。

## 宿主配置与主题

Kit 使用宿主同一个 Ant Design v4 实例，沿用外层 `ConfigProvider` 的语言、方向、尺寸、`prefixCls` 和弹层容器配置。Kit 对 Antd 内部结构的局部覆盖兼容自定义前缀。

Antd v4 使用 Less 编译主题时，主色已经固化在宿主 CSS 中。将相同变量映射给 Kit，可保持两者一致。

```less
@primary-color: #a30030;

:root {
  --finwork-primary-color: @primary-color;
  --finwork-primary-hover-color: lighten(@primary-color, 10%);
  --finwork-primary-bg: fade(@primary-color, 6%);
}
```

使用 `antd.variable.css` 和 `ConfigProvider.config({ theme })` 动态主题时，Kit 主色可沿用 `--ant-primary-color`。`--finwork-*` 的优先级更高，也可在容器上覆盖，作用于其后代。弹层通过 portal 渲染时，由宿主 `getPopupContainer` 决定其父节点，需让主题变量覆盖弹层所在位置。

| CSS 变量 | 用途 |
| --- | --- |
| `--finwork-primary-color`、`--finwork-primary-hover-color`、`--finwork-primary-bg` | 品牌主色、悬停色与浅背景 |
| `--finwork-text-color`、`--finwork-text-secondary`、`--finwork-text-tertiary` | 正文与辅助文字 |
| `--finwork-bg-color`、`--finwork-bg-secondary`、`--finwork-bg-hover` | 表面、次级与悬停背景 |
| `--finwork-border-color` | 边框 |
| `--finwork-success-color`、`--finwork-warning-color`、`--finwork-error-color`、`--finwork-info-color` | 语义颜色，优先沿用对应 Antd 变量 |
| `--finwork-code-bg-color`、`--finwork-code-text-color`、`--finwork-code-border-color` | 代码容器背景、正文与边框，高亮语法色使用作用域内的 VS2015 主题 |

局部 CSS 变量负责 Kit 自有样式，Antd 基础组件的主题由宿主 Antd 样式负责。使用 file/link 开发时，将 `react`、`react-dom`、`antd`、`@ant-design/icons` 加入 Vite `resolve.dedupe`，让两侧解析到同一实例。

## 自定义正文

`AssistantContent` 默认使用 `StreamingMarkdownRenderer`。展示正在累积的文本时，传入当前完整 `content` 和 `isStreaming`。需要整体接管正文时，传入 `renderContent`。

```tsx | pure
import { AssistantContent } from '@lz19.02/finwork-kit/chat/ui';

export default function CustomAnswer() {
  return (
    <AssistantContent
      content="自定义正文"
      renderContent={(content) => <pre>{content}</pre>}
    />
  );
}
```

## 接入应用状态

1. 页面从自己的 props、context 或 store 读取内容。完整普通回答交给 `MessageContentList`，单条 Markdown 可以直接用 `AssistantContent`。
2. 流式回调将增量归并成累积正文，更新同一个内容项，并将它的 `msg_content_id || id` 传入 `streamingAssistantContentId`。流结束时清空该属性。使用 SDK 时直接取当前轮次的 `activeContentId`。参见[实时接入](/sdk/overview#处理流式对话)。
3. 对话历史通过同样的组件渲染。SDK 回放的数据按轮次提供用户消息、状态和文件。参见[回放历史对话](/sdk/overview#回放历史对话)。
4. 在回调里执行下载、提交反馈、续问和打开详情等动作。把加载、禁用或选中状态作为 props 传回组件。

## 接入排查

| 现象 | 检查项 |
| --- | --- |
| 安装时报找不到包或版本 | 确认项目配置的 npm 源已发布该包，并设置了 `latest` 标签。使用本地构建产物时，将实际的 `.tgz` 路径传给 `pnpm add`。 |
| 无法解析导入 | 使用公开子路径导入。UI 导入 `@lz19.02/finwork-kit/chat/ui`，纯 SDK 导入对应 core 子路径。 |
| 可渲染但没有样式或首次展开跳动 | 检查两份 CSS 是否从应用入口加载，且 Ant Design 主题先于 Kit 样式。 |
| 流式正文只剩最后一段 | 传给组件的是累计内容。如果后端发 `text_delta`，先追加到旧正文或使用 SDK 归并。 |
| 引用有编号但点不到来源 | 检查是否传入 `renderReference`，并确认回调按 `referenceId` 取得来源数据。参见[Markdown 与引用](/reference/markdown#接入引用来源)。 |
| 受控折叠点击无变化 | 在变更回调里更新 `expanded` 或 `contentExpandedMap`，由组件重新接收新值。 |
