# FinWork Kit

FinWork 可复用能力库，npm 包名为 `@lz19.02/finwork-kit`。一个仓库维护两个交付物：

- npm 库：提供 UI 组件、处理 FinWork Agent 历史数据的 core-detail 与流式数据的 core-sse，以业务子入口扩展。
- dumi 文档站：维护组件与 core 工具函数的介绍、API 和使用案例。

当前仅完成项目骨架，尚未实现真实 SSE、历史解析或聊天 UI。文档与使用案例先保留占位，后续以经过迁移测试的 FinPlus 实际接入代码补充。

## 代码与构建边界

- `src/` 只维护 npm 库；`docs/` 只维护文档、使用案例和站点资源。库源码不能引用 docs、dumi 或站点专用依赖。
- 文档通过公开包路径单向引用库，开发和构建时映射到 src，不要求先构建 npm 库。
- `build:lib` 只构建 `dist/`；`docs:build` 只构建 `site-dist/`，不触发库构建，不修改库产物。
- 两者共享一个 package.json 和锁文件，依赖与工具版本仍需共同维护；这是源码、构建和发布边界隔离，并非两个独立安装环境。

## 环境

- pnpm 8.12.1；依赖版本固定在 package.json 和 pnpm-lock.yaml。
- 库构建：Vite 6.4.3 + React 18.3.1 + TypeScript 5.9.3。
- 文档站：dumi 2.4.21。
- 本地已验证 Node 25.7.0；其他 Node 版本尚未验证。

## 入口

- @lz19.02/finwork-kit/chat/core-sse：testCoreSse() 返回 core-sse:ok。
- @lz19.02/finwork-kit/chat/core-detail：testCoreDetail() 返回 core-detail:ok。
- @lz19.02/finwork-kit/chat/ui：ChatExample，支持 title 属性。
- @lz19.02/finwork-kit/chat/style.css：UI 样式，使用 UI 时显式导入。

第一阶段提供 ESM 与 TypeScript 声明，不提供 CommonJS 或包根聚合入口。仅使用 core 不需要 React；UI 消费者需提供 React/react-dom 18.3.1 兼容版本。

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

| 命令 | 用途 |
| --- | --- |
| pnpm install | 安装依赖，首次安装后提交 pnpm-lock.yaml |
| pnpm dev / pnpm docs:dev | 开发文档站，默认端口 8000 |
| pnpm docs:preview | 预览已构建文档站，默认端口 4174 |
| pnpm dev:lib | 监听库 JS/CSS，供外部 link 联调 |
| pnpm dev:types | 监听库声明，供外部 TypeScript 消费 |
| pnpm typecheck | 检查库源码、文档案例和配置类型 |
| pnpm verify:exports | 构建后检查入口、声明、core 隔离、CSS 和 UI 静态渲染 |
| pnpm pack:check | 构建并预检 npm 包文件列表，不发布 |

文档站开发和生产构建使用源码 alias，外部项目消费使用 dist。文档与使用案例统一放在 docs/，站点依赖只用于开发，不进入 npm 包。不要将站点样式当作库样式。文档站构建不作为 npm 包可消费的验证，包入口和外部消费者需单独检查。

使用案例当前只保留占位；待 Kit 能力开发完成、FinPlus 接入迁移测试通过后，以 FinPlus 实际接入代码补充，不维护独立 Demo 工程。

## npm link

先在本项目执行 pnpm build:lib，再执行 npm link。在 npm 管理的消费方执行 npm link @lz19.02/finwork-kit，并从上述公开子入口导入。不要导入 src 或 dist 深路径。

当前已验证独立 npm 消费者的 link 导入、类型检查、UI 静态渲染和 Vite 构建。pnpm 管理的消费方应单独验证其包管理器的本地 link 流程，避免直接混用 npm 改写 pnpm 安装结构。

外部联调时，分别在两个终端运行 pnpm dev:lib、pnpm dev:types，监听 JS/CSS 和声明。首次使用先执行完整 build。watch 模式不清理 dist；完整 build 会重建目录，运行 watch 时不要交叉执行完整 build。

React/react-dom 是外部 peer，但 symlink 可能让开发依赖产生重复 React。Vite 消费者应配置 resolve.dedupe 为 react、react-dom；其他构建器需要相应的单实例解析配置。不要未经验证统一开启 preserveSymlinks。

link 与 tarball 消费是不同验收项；当前两种方式均已通过独立 npm 消费者的导入、类型检查、UI 静态渲染和 Vite 构建。本阶段不执行 npm publish。

## 实施与协作

- AGENTS.md：仓库约束及后续自动化协作规则。
