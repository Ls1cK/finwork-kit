# FinWork Kit

FinWork 可复用能力库。一个仓库、一个 npm 包，以业务子入口扩展。当前仅完成项目骨架，尚未实现真实 SSE、历史解析或聊天 UI。

## 环境

- pnpm 8.12.1；依赖版本固定在 package.json 和 pnpm-lock.yaml。
- Demo：Vite 6.4.3 + React 18.3.1 + TypeScript 5.9.3。
- 文档站：dumi 2.4.21。
- 内网目标 Node 版本待确认；本地验证环境与结果见 VALIDATION.md。

## 入口

- finwork-kit/chat/core-sse：testCoreSse() 返回 core-sse:ok。
- finwork-kit/chat/core-detail：testCoreDetail() 返回 core-detail:ok。
- finwork-kit/chat/ui：ChatExample，支持 title 属性。
- finwork-kit/chat/style.css：UI 样式，使用 UI 时显式导入。

第一阶段提供 ESM 与 TypeScript 声明，不提供 CommonJS 或包根聚合入口。仅使用 core 不需要 React；UI 消费者需提供 React/react-dom 18.3.1 兼容版本。

## 构建命令与流水线配置

三个构建目标独立配置。npm 包发布流水线与站点部署流水线由平台分别手动配置，本仓库不预设内网流水线模板或发布凭据。

| 构建目标 | 流水线执行命令 | 产物目录 | 后续平台动作 |
| --- | --- | --- | --- |
| npm 包库 | pnpm build:lib（pnpm build 与其同义） | dist/ | 在项目根目录按 package.json 打包并发布到配置好的 registry |
| 文档站 | pnpm docs:build | site-dist/ | 将此目录部署为静态站点，不执行 npm 发布 |
| Demo 站点 | pnpm demo:build | demo-dist/ | 将此目录部署为静态站点，不执行 npm 发布 |

流水线安装步骤使用 pnpm install --frozen-lockfile。工具版本、registry、认证、发布触发方式、站点域名与部署路径由平台单独配置；当前不承诺某个内网流水线已经可用。

重要约定：

- build/build:lib 只构建库，不构建或部署文档站、Demo，也不执行 npm publish。
- docs:build/demo:build 会先构建库，保证站点使用实际公开入口，再构建自身页面；对应部署流水线只收集 site-dist/ 或 demo-dist/。
- dist/ 是 npm 包的 JS、类型和 CSS，不能作为文档站的部署目录。
- npm 包通过 files 白名单只包含 dist/ 及 npm 自动附带的必要元信息/README；不包含文档站、Demo、测试脚本、AGENTS.md 或站点构建产物。
- 标准 npm pack/npm publish 的 prepack 会重新构建库。若发布平台关闭生命周期脚本，必须在打包前显式执行 build:lib。
- 此阶段不提供自动发布、版本变更或内网 registry 配置；后续根据实际流水线适配。

## 本地开发与验证命令

| 命令 | 用途 |
| --- | --- |
| pnpm install | 安装依赖，首次安装后提交 pnpm-lock.yaml |
| pnpm dev / pnpm demo:dev | 开发 Demo，默认 http://127.0.0.1:5173 |
| pnpm demo:preview | 预览已构建 Demo，默认端口 4173 |
| pnpm docs:dev | 开发文档站，默认端口 8000 |
| pnpm docs:preview | 预览已构建文档站，默认端口 4174 |
| pnpm dev:lib | 监听库 JS/CSS，供外部 link 联调 |
| pnpm dev:types | 监听库声明，供外部 TypeScript 消费 |
| pnpm typecheck | 检查源码、Demo 和配置类型 |
| pnpm verify:exports | 构建后检查入口、声明、core 隔离、CSS 和 UI 静态渲染 |
| pnpm pack:check | 构建并预检 npm 包文件列表，不发布 |

Demo/文档站开发可使用源码 alias；生产构建和外部项目消费使用 dist。文档源码放 docs，站点依赖只用于开发，不进入 npm 包。不要将站点样式当作库样式。

## npm link

先在本项目执行 pnpm build:lib，再执行 npm link。在 npm 管理的消费方执行 npm link finwork-kit，并从上述公开子入口导入。不要导入 src 或 dist 深路径。

pnpm 管理的消费方应单独验证其包管理器的本地 link 流程，避免直接混用 npm 改写 pnpm 安装结构。本次离线混用测试触发过 npm 重新解析依赖；pnpm link 还提示重装源项目依赖，该步骤没有强制执行。当前通过的基准是独立 npm 消费者，详见 VALIDATION.md。

外部联调时，分别在两个终端运行 pnpm dev:lib、pnpm dev:types，监听 JS/CSS 和声明。首次使用先执行完整 build。watch 模式不清理 dist；完整 build 会重建目录，运行 watch 时不要交叉执行完整 build。

React/react-dom 是外部 peer，但 symlink 可能让开发依赖产生重复 React。Vite 消费者应配置 resolve.dedupe 为 react、react-dom；其他构建器需要相应的单实例解析配置。不要未经验证统一开启 preserveSymlinks。

link 与 tarball 消费是不同验收项；详细环境、实际通过项和清理说明记录在 VALIDATION.md。本阶段不执行 npm publish。

## 实施与协作

- IMPLEMENTATION.md：第一阶段的文件职责、实现步骤和验收边界。
- AGENTS.md：仓库约束及后续自动化协作规则。
- VALIDATION.md：实际执行过的验证与未验证事项。
