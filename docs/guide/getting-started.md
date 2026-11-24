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

应用已有兼容版本时可直接复用。宿主同时声明 `antd@^4.24.8` 与 `@ant-design/icons@^4.8.3`，这些 peer 与 React 一起共享实例。ahooks、Markdown 解析、YAML 与代码高亮由 Kit 自动安装。

## 首次使用

在应用入口加载宿主的 Ant Design 主题和 Kit 编译后的 CSS，随后挂载应用。Kit CSS 包含作用域内的组件和代码高亮样式。

组件源码各自导入所需的 CSS Module，全量样式入口独立提供预加载能力。发布包使用单份 `chat/style.css`，由宿主入口显式加载。

```tsx | pure
// 替换为宿主已有的 Ant Design 主题入口。
import './styles/antd-theme.less';
import '@lz19.02/finwork-kit/chat/style.css';
```

下面的示例由应用提供消息内容，Kit 负责展示。

<code src="../examples/messages.tsx"></code>

两份 CSS 应在应用入口静态导入。即使消息模块通过 `lazy()` 加载，样式也应先于它加载，避免先展示旧组件、随后切换 Kit 及其样式引起箭头布局变化。

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

## 接入业务状态

在应用的适配组件中订阅 store 或读取 context，再把数据和动作传入 Kit。复制、下载、反馈、路由跳转及任务完成判定由应用维护。组件接收展示所需的数据、回调和渲染插槽。

更多示例和 API 见[组件](/reference/overview)，自定义内容类型见[消息内容](/reference/content#自定义内容)。多智能体协作对话可参考 [OPC 协作对话](/reference/opc)。
