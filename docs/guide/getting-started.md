---
title: 快速开始
description: 接入 FinWork Kit v0.1.0 UI 组件。
---

# 快速开始

v0.1.0 已提供消息 UI、Markdown、流式文本、代码高亮及引用展示。

## 安装

在应用项目中安装 FinWork Kit。请先确保项目配置的 npm 源中已有所需版本。

```bash
pnpm add @lz19.02/finwork-kit@0.1.0
```

## React 环境

新项目建议使用以下已验证的 React 版本。React 与 React DOM 通过 peerDependencies 与宿主共享，当前兼容范围为 `^18.3.1`。

```bash
pnpm add react@18.3.1 react-dom@18.3.1
```

应用已有兼容 React 版本时可直接复用。Ant Design、图标、ahooks、Markdown 解析、YAML 与代码高亮由 Kit 的 dependencies 自动安装。宿主已有相同版本时可由包管理器去重。

如需在宿主直接编写 Ant Design 或图标组件，建议在宿主声明 `antd@4.24.8`、`@ant-design/icons@4.8.3`，使宿主直接使用的包拥有明确依赖并与 Kit 对齐。

## 首次使用

在应用入口导入 Kit 编译后的样式，其中已包含 Ant Design 基础样式和代码高亮主题。

```tsx | pure
import '@lz19.02/finwork-kit/chat/style.css';
```

下面的示例由应用提供消息内容，Kit 负责展示。

<code src="../examples/messages.tsx"></code>

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

## 接入业务状态

在应用的适配组件中订阅 store 或读取 context，再把数据和动作传入 Kit。复制、下载、反馈、路由跳转及任务完成判定由应用维护。组件接收展示所需的数据、回调和渲染插槽。

更多示例和 API 见[组件](/reference/overview)，自定义内容类型见[消息内容](/reference/content#自定义内容)。
