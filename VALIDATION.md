# 第一阶段验证记录

日期：2026-10-29。本记录区分实际执行结果和未验证范围，不表示已经实现真实聊天能力。

## 环境

- macOS，本地 Node 25.7.0、pnpm 8.12.1、npm 11.10.1。
- React/react-dom 18.3.1，Vite 6.4.3，TypeScript 5.9.3，Less 4.6.7。
- dumi 固定 2.4.21，本次锁文件解析到 Umi 4.7.28。
- 本次依赖从公共 npm registry 安装，不代表内网 registry 或流水线已验收。

## 已通过

| 检查 | 实际结果 |
| --- | --- |
| 安装 | 固定直接依赖安装完成，生成 pnpm-lock.yaml |
| 类型 | pnpm typecheck 通过，覆盖库、Demo 和工程配置 |
| 库构建 | 多入口 ESM、独立 CSS、TypeScript 声明成功生成 |
| 入口断言 | 两个 core 函数返回预期字符串，所有 exports 目标文件存在 |
| core 隔离 | 在没有 React 依赖和 DOM 的临时环境中导入两个 core 产物并通过断言 |
| UI 静态渲染 | ChatExample 可由 ReactDOMServer 渲染并保留传入 title |
| Demo 构建 | 通过公开包路径消费实际 dist，构建成功，输出 demo-dist |
| 文档构建 | dumi 2.4.21 Webpack 构建成功，输出 site-dist |
| Demo 开发与预览 | 独立测试端口启动，HTTP 200，开发源码 alias 转换正常 |
| 文档开发与预览 | 独立测试端口启动，HTTP 200 |
| npm link | 临时 npm global prefix 注册后，独立 npm 消费者成功 link |
| link 消费 | 公开入口导入、组件静态渲染、消费者类型检查和 Vite 构建全部通过 |
| tarball 白名单 | 实际打包 10 个文件，仅包含 dist、package.json、README.md |
| tarball 消费 | 干净消费者安装实际 tgz 后，入口断言、静态渲染、类型检查和 Vite 构建通过 |

启动检查只验证服务与 HTTP，没有执行浏览器自动化、视觉布局或浏览器交互检查。测试服务检查完成后已停止；npm link 使用隔离前缀，没有改动已有全局链接或 FinPlus 的 node_modules。

## 已发现的边界

- 在 pnpm 安装结构中混用离线 npm link 时，npm 尝试重新解析未缓存的开发依赖，返回 ENOTCACHED。该失败发生在临时消费者，未据此判定库的标准 npm 链接失败。
- 对 pnpm 消费者尝试其自身 link 命令时，出现重装源项目 node_modules 的提示；没有确认或强制执行。pnpm 管理宿主的端到端链接尚未验收。
- dumi 的传递依赖安装存在弃用提示，以及未使用的 Utoopack 分支的 Less loader/PostCSS peer 警告。当前实际使用的 Webpack 文档开发与生产构建成功；没有添加全局 override 去修改不相关依赖。
- Node 25 下出现 pnpm 的 url.parse 弃用提示和 dumi 的 localstorage-file 警告，不影响本次通过项。其他 Node 版本和内网工具链需另外验证。

## 未执行

- npm publish、内网 npm 认证及发布流水线。
- Demo/文档站的生产部署、域名、路由前缀或镜像适配。
- 浏览器视觉、交互、真实 SSE/Detail 数据和真实聊天功能。
- CommonJS、其他打包器及全部 Node/React 版本的兼容验证。
- JS/类型 watch 在编辑源码后的外部宿主热更新；当前仅配置命令，不将其声明为已通过专项验证。

## 构建与发布口径

README 的命令表为配置依据：库流水线用 build:lib 收集 npm 包；文档站用 docs:build 部署 site-dist；Demo 用 demo:build 部署 demo-dist。三者不互相代替，也不默认触发自动发布。
