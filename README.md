# FinWork Kit

当前版本为 **0.1.0**，首批 UI 组件已可使用，提供消息编排、流式 Markdown、代码高亮、文件、引用与自定义操作栏。当前使用本地 file 接入，内网源发布由使用方维护。

FinWork 是面向金融与办公场景的专业级任务执行智能体产品。FinWork Kit 是支撑其体验复用的组件与工具库，npm 包名为 `@lz19.02/finwork-kit`。一个仓库维护两个交付物：

- npm 库：提供 UI 组件、处理 FinWork Agent 历史数据的 core-detail 与流式数据的 core-sse，以业务子入口扩展。
- dumi 文档站：维护组件与 core 工具函数的介绍、API 和使用案例。

当前已提供消息 UI、Markdown 与流式展示组件、源码依赖护栏及可重复的包消费检查。消息容器、内容分发与单项组件、工具展示、子智能体、文件和操作栏均通过 props 接收数据与回调。点赞点踩的业务表单和弹窗由宿主维护。FinPlus MessageItem 采用配置控制的 Kit/原组件双路接入。SSE 和历史解析仍处于骨架阶段。

文档阅读入口：[介绍](docs/guide/introduction.md) · [快速开始](docs/guide/getting-started.md) · [组件与 SDK](docs/reference/overview.md)。

## 代码与构建边界

- `src/` 只维护 npm 库；`docs/` 只维护文档、使用案例和站点资源。库源码不能引用 docs、dumi 或站点专用依赖。
- 文档通过公开包路径单向引用库，开发和构建时映射到 src，不要求先构建 npm 库。
- `build:lib` 只构建 `dist/`；`docs:build` 只构建 `site-dist/`，不触发库构建，不修改库产物。
- 两者共享一个 package.json 和锁文件，依赖与工具版本仍需共同维护；这是源码、构建和发布边界隔离，并非两个独立安装环境。

## 环境

- pnpm 8.12.1；依赖版本固定在 package.json 和 pnpm-lock.yaml。
- 库构建：Vite 6.4.3 + React 18.3.1 + TypeScript 5.9.3。
- 文档站：dumi 2.4.21。
- 项目通过 `.nvmrc` 选择 Node 22.9.0，用于文档开发与构建。已有库检查还曾在 Node 25.7.0、npm 11.10.1 下验证。
- Node 25.7.0 下文档构建会遇到 dumi/Umi 间接依赖的 `http_parser` 加载错误；文档开发与构建请使用已验证的 Node 22 环境。以上为验证记录，不代表最低版本要求。

## 入口

- @lz19.02/finwork-kit/chat/core-sse：testCoreSse() 返回 core-sse:ok。
- @lz19.02/finwork-kit/chat/core-detail：testCoreDetail() 返回 core-detail:ok。
- @lz19.02/finwork-kit/chat/ui 提供消息 UI 及其公开类型，组件清单与接口边界见 [组件与 SDK](docs/reference/overview.md)。
- @lz19.02/finwork-kit/chat/style.css：UI 样式，使用 UI 时显式导入。

第一阶段提供 ESM 与 TypeScript 声明。React/react-dom 以 peerDependencies 共享宿主运行时，兼容范围为 `^18.3.1`。Ant Design 4.24.8、@ant-design/icons 4.8.3、ahooks 3.9.7、markdown-to-jsx 8.0.0、yaml 2.9.0、highlight.js 11.11.1 和 highlightjs-vue 1.0.0 由 Kit 的 dependencies 自动安装。同版本可由包管理器去重；宿主直接使用这些包时应自行声明对应依赖。UI 仅需显式导入 `@lz19.02/finwork-kit/chat/style.css`，其中包含 Ant Design 基础样式及高亮主题。单包安装会带上 UI 依赖，core 源码、运行入口和声明保持独立。

## 构建命令与流水线配置

两个构建目标独立配置。npm 包发布流水线与文档站部署流水线由平台分别手动配置，本仓库不预设内网流水线模板或发布凭据。

| 构建目标 | 流水线执行命令 | 产物目录 | 后续平台动作 |
| --- | --- | --- | --- |
| npm 包库 | pnpm build:lib（pnpm build 与其同义） | dist/ | 在项目根目录按 package.json 打包并发布到配置好的 registry |
| 文档站 | pnpm docs:build | site-dist/ | 将此目录部署为静态站点，不执行 npm 发布 |

流水线安装步骤使用 pnpm install --frozen-lockfile。工具版本、registry、认证、发布触发方式、站点域名与部署路径由平台单独配置；当前不承诺某个内网流水线已经可用。

重要约定：

- build/build:lib 只构建库，不构建或部署文档站，也不执行 npm publish。
- docs:build 只构建文档站；文档站部署流水线只收集 site-dist/。
- dist/ 是 npm 包的 JS、类型和 CSS，不能作为文档站的部署目录。
- npm 包通过 files 白名单只包含 dist/ 及 npm 自动附带的必要元信息/README；不包含文档站、使用案例、测试脚本、AGENTS.md 或站点构建产物。
- 标准 npm pack/npm publish 的 prepack 会重新构建库。若发布平台关闭生命周期脚本，必须在打包前显式执行 build:lib。
- 此阶段不提供自动发布、版本变更或内网 registry 配置；后续根据实际流水线适配。

## 本地开发与验证命令

在项目根目录先切换 Node，再启动文档站：

```bash
nvm use
pnpm dev
```

如果尚未安装 `.nvmrc` 指定的版本，先执行 `nvm install`。`.nvmrc` 不会自动切换当前终端；直接在 Node 25 下运行 `pnpm dev` 仍会遇到上述依赖兼容问题。

| 命令 | 用途 |
| --- | --- |
| pnpm install | 安装依赖，首次安装后提交 pnpm-lock.yaml |
| pnpm dev / pnpm docs:dev | 开发文档站，默认端口 8000 |
| pnpm docs:preview | 预览已构建文档站，默认端口 4174 |
| pnpm dev:lib | 监听库 JS/CSS，供外部 link 联调 |
| pnpm dev:types | 监听库声明，供外部 TypeScript 消费 |
| pnpm typecheck | 检查库源码、文档案例和配置类型 |
| pnpm test | Node 内置测试运行器，非 watch 模式；验证工程护栏正反例 |
| pnpm check:boundaries | 检查库依赖、docs 隔离及 core 的传递依赖与无 DOM 类型环境 |
| pnpm verify:exports | 构建后检查入口、声明、core 隔离、CSS 和 UI 静态渲染 |
| pnpm verify:consumer | 构建后打包，在临时消费者验证依赖自动安装、tarball 与目录 symlink 的公开类型、SSR、CSS 和 Vite 构建 |
| pnpm check | 依次运行类型、边界、测试、库构建、exports 与消费者检查；不构建文档站、不发布 |
| pnpm pack:check | 构建并预检 npm 包文件列表，不发布 |

文档站开发和生产构建使用源码 alias，外部项目消费使用 dist。文档与使用案例统一放在 docs/，站点依赖只用于开发，不进入 npm 包。不要将站点样式当作库样式。文档站构建不作为 npm 包可消费的验证，包入口和外部消费者需单独检查。

日常提交前运行 `pnpm check`；修改文档或站点配置时另外运行 `pnpm docs:build`。单独运行 `verify:exports` 或 `verify:consumer` 前先执行 `pnpm build:lib`，避免检查旧产物。首次开发仍须安装锁定依赖；消费检查优先使用缓存，缺失时从配置的 registry 安装临时消费者依赖，并在 finally 中清理临时目录，不修改全局链接或业务项目。

文档站已提供基于 FinPlus 实际适配方式整理的消息组合和内容扩展示例，示例统一放在 docs/，通过公开包路径使用库。

## npm link

FinPlus 当前使用 `file:../finwork-kit`。两个仓库放在同一父目录下，先在 Kit 执行 `pnpm build:lib`，再在 FinPlus 执行 `pnpm install`，刷新本地包副本。消费路径指向 `dist` 公开入口。Kit 源码更新后需要再次构建并刷新 file 依赖。FinPlus 已配置 React、React DOM 和 Ant Design 的 dedupe。

先在本项目执行 pnpm build:lib，再执行 npm link。在 npm 管理的消费方执行 npm link @lz19.02/finwork-kit，并从上述公开子入口导入。不要导入 src 或 dist 深路径。

当前已验证独立 npm 消费者的 link 导入、类型检查、UI 静态渲染和 Vite 构建。pnpm 管理的消费方应单独验证其包管理器的本地 link 流程，避免直接混用 npm 改写 pnpm 安装结构。

外部联调时，分别在两个终端运行 pnpm dev:lib、pnpm dev:types，监听 JS/CSS 和声明。首次使用先执行完整 build。watch 模式不清理 dist；完整 build 会重建目录，运行 watch 时不要交叉执行完整 build。

React/react-dom 是外部 peer，但 symlink 可能让开发依赖产生重复 React。Vite 消费者应配置 resolve.dedupe 为 react、react-dom；其他构建器需要相应的单实例解析配置。不要未经验证统一开启 preserveSymlinks。

link 与 tarball 消费是不同验收项；当前两种方式均已通过独立 npm 消费者的导入、类型检查、UI 静态渲染和 Vite 构建。本阶段不执行 npm publish。

`pnpm verify:consumer` 将 tarball 消费和等效的包目录 symlink 消费固化为自动检查；它不执行全局 `npm link`，也不代替 pnpm 消费方 link/unlink 的专项验证。core 检查使用无 DOM、无环境 types 的配置，另由 exports 检查在无依赖目录隔离运行。UI 使用 React 18、TypeScript Bundler 解析和 Vite。UI 的 NodeNext 类型解析、CJS、其他 React 版本及构建器不在当前支持矩阵内。

## 实施与协作

- AGENTS.md：仓库约束及后续自动化协作规则。
- [开发与验证说明](MAINTAINING.md)：仓库维护资料，不进入面向使用者的文档站。
