# 第一阶段技术实现

本阶段只实现可运行、可构建、可链接的单包骨架，不迁移生产聊天代码。项目名和 npm 包名均为 finwork-kit。

## 1. 已确认技术栈

- Demo：Vite 6.4.3、@vitejs/plugin-react 4.7.0、React/react-dom 18.3.1。
- 文档：dumi 2.4.21。
- 类型与样式：TypeScript 5.9.3、Less 4.6.7、CSS Modules。
- 包管理：pnpm 8.12.1，一个 package.json、一个 pnpm-lock.yaml。
- 输出：ESM、TypeScript 声明、独立 CSS。当前没有 CommonJS 或包根聚合入口。
- 本地 Node 为 25.7.0；内网目标运行时和流水线仍待实际验证。

## 2. 源码与目录

- src/chat/core-sse/index.ts：testCoreSse()，固定返回 core-sse:ok。
- src/chat/core-detail/index.ts：testCoreDetail()，固定返回 core-detail:ok。
- src/chat/ui/：ChatExample、props 类型及自有 Less 样式。
- config/entries.ts：集中定义库入口与源码开发 alias。
- demo/：独立 Vite 页面，使用公开包路径调用两个函数并渲染 UI。
- docs/：文档站内容，目前只有最小首页。
- scripts/verify-exports.mjs：实际产物的断言检查。

## 3. 类型与入口

1. tsconfig.json 检查源码、Demo 和构建配置，使用 strict、Bundler 模块解析及 React 自动 JSX 运行时。
2. tsconfig.build.json 只包含 src，生成 dist/types；不将 Demo、文档和站点工具声明暴露给消费者。
3. package.json exports 映射三个 JS 子入口和一个 CSS 入口。
4. React/react-dom 声明为可选 peer；开发环境显式安装，core 消费不需要安装 React。

## 4. 库构建

1. vite.lib.config.ts 配置三个入口，输出 dist/chat/core-sse.js、core-detail.js、ui.js。
2. CSS Modules + Less 编译为 dist/chat-ui.css。
3. React/react-dom 以及其子路径 external，防止打包一份额外 React。
4. JS 构建完成后运行 tsc，生成对应声明。
5. 正常 build 清理旧产物；watch 不反复清空声明目录。
6. files 白名单约束 npm 内容，CSS 声明为 side effect。

## 5. Demo

1. Vite root 指向 demo，包含独立 HTML 与 React 入口。
2. 本地开发将公开包路径 alias 到源码；生产构建取消源码 alias，通过 exports 消费 dist。
3. resolve.dedupe 指定 react/react-dom，处理链接开发中的单实例解析。
4. 输出 demo-dist，与库和文档站输出隔离。

## 6. 文档站

1. .dumirc.ts 使用固定版本 dumi，显式扫描 docs，不混入 src 下的 Markdown。
2. 开发时使用明确子入口 alias；生产构建关闭源码 alias。
3. 输出 site-dist，docs 作为版本化源码保留。
4. dumi 临时目录不提交；未来站点专用资源不得反向成为库依赖。

## 7. 独立构建与发布边界

README 的构建表是流水线配置依据：

- build/build:lib：仅生成 npm 库。
- docs:build：构建库前置产物及文档站，站点部署收集 site-dist。
- demo:build：构建库前置产物及 Demo，站点部署收集 demo-dist。

不复制其他项目的发布流水线，不预设 registry、scope、认证、镜像、域名、自动发布或审批机制。按标准 npm 包结构交付，实际平台有差异时再适配。

## 8. 验证次序

1. 安装固定依赖并提交锁文件。
2. typecheck、build:lib、verify:exports。
3. Demo 与文档分别执行生产构建。
4. 开发与预览命令做启动/HTTP 检查，不以此代替浏览器交互验证。
5. 在隔离的真实 npm 消费者中执行 npm link、类型检查、组件静态渲染与 Vite 构建。
6. 生成 npm tarball，检查文件列表，并在无源码 alias 的消费者中安装和构建。
7. 纯 core 消费者验证不依赖 React/DOM。
8. 结果与未通过项逐项记录在 VALIDATION.md；不把本地公共 registry 验证宣称为内网流水线验收。
