# 开发与验证

当前交付包含工程护栏、普通对话与 OPC 的流式归并和历史回放 SDK，以及从 FinPlus 抽离的消息、Markdown、流式展示及代码高亮组件。UI 使用显式 props、回调和渲染插槽，FinPlus 的 store、服务、业务反馈弹窗与路由由消费方适配。库按共享 Antd peer、作用域 CSS 与主题变量维护。

## 目录与依赖边界

| 位置 | 职责 | 约束 |
| --- | --- | --- |
| `src/chat/core-sse`、`src/chat/core-detail` | 帧解码、单轮归并和历史回放 | 不引用 React、UI、样式、DOM、应用 store 或服务 |
| `src/chat/ui` | 展示组件 | 使用显式 props/回调；CSS Modules + Less，输出编译后的 CSS |
| `docs/` | 文档、未来真实接入案例和站点资源 | 通过公开包路径引用源码；库不能反向引用 docs |
| `tests/` | 工程护栏的正反例 | 使用临时合成工程；不复制业务数据，不进入 npm 包 |
| `scripts/` | 工程检查与包消费验证 | 使用 Node 与已有工具；不包含凭据、发布或部署逻辑 |

`pnpm check:boundaries` 使用 TypeScript 自带的预处理、模块解析与编译器，不自行解析 import 字符串。它检查所有库 TS/TSX 文件的静态依赖，只允许引用 src 内部模块和声明过的运行/peer 依赖；dumi/站点工具、宿主 alias、越界引用和计算得到的动态模块路径会报错。样式和资产必须位于 src 内。

两个 core 入口另以 ES2020、无 DOM、无环境 types 的编译环境检查其传递依赖，因此共享 helper 中的浏览器全局和 UI 引用也会被检查。这个检查有意比普通 UI 类型检查严格。新增其他领域的纯 core 入口时，必须同步登记 `scripts/check-boundaries.mjs` 的 core roots 并补反例测试。

源码护栏和实际产物检查需要同时保留：前者防止架构越界，后者证明导出、声明、CSS 和包解析可用。

## SDK 实施与验收

| 工作项 | 代码归属 | 验收方式 |
| --- | --- | --- |
| 帧解码与普通对话 | `src/chat/core-sse` | 比较单批与分批归并结果，覆盖累计文本、无块 ID 增量、历史兼容、子智能体与输入关闭。 |
| 实时批次 | `reduceStreamBatch` | 核对任务与回答 ID、跨任务浏览器动作顺序，以及自然关闭、取消和失败时的尾帧策略。 |
| 公共事件 | `src/chat/core-sse/answer.ts` | 普通和 OPC 共用浏览器、用量、引用和用户追问，核对实时与历史状态。 |
| OPC 单轮归并 | `src/chat/core-sse/opc.ts` | 对照多专家交错、同一专家多次派发、迟到回传和不同运行隔离，核对与 FinPlus Mock 的时间线、派发和回复。 |
| 历史解析与回放 | `src/chat/core-detail` | 验证相同事件的历史投影，覆盖空记录、异常帧诊断、文件分类和用户回答关联。 |
| 独立消费验证 | `scripts/verify-exports.mjs`、`scripts/verify-consumer.mjs` | 构建后检查公开入口、无 DOM 的 NodeNext 声明及 tarball／目录 symlink 消费。另验证文档站单独构建。 |

实时流和历史记录使用同一归并器。归并器接收单轮旧快照并返回新快照和动作意图。请求鉴权、事件攒批、重试、存储和意图执行属于宿主。OPC 无时区的时间戳采用统一 UTC 基准计算同一回复内的相对耗时，显示时间由宿主格式化。公开接口与自定义示例见 [SDK 指南](docs/sdk/overview.md)。

## OPC 协作对话设计

普通对话与 OPC 共用 `chat/ui` 和 `chat/style.css`。OPC 组件实现位于 `src/chat/ui/opc/`，样式使用现有 CSS 变量。普通消息、过程、结论、文件与操作栏沿用现有组件和渲染插槽。

| FinPlus 已有实现 | Kit 可复用能力 | 宿主适配 |
| --- | --- | --- |
| `ChatPanel/OpcAnwser` 的头像和状态 | `OpcAvatar`、`OpcStatus` | 提供头像、状态、文案和可选的执行详情回调 |
| OPC 回答 | `OpcAnswer` 组合时间线、公共追问、异常提示和页脚。`OpcTimeline` 可单独展示事件 | 将有序事件映射为 `OpcTimelineEntry[]`，传入共享消息的 `contentList`，关联派发与回复 |
| `WorkspaceDrawer/OpcExpertSpace` | `OpcExpertPanel` 渲染专家选择、任务菜单、任务状态、空态与内容区域 | 提供当前专家对应的任务，维护轮次、专家、任务选择，透传关闭按钮和滚动 refs |
| `ExecutionProcessCollapse`、`ChatAnswerFooter` | `TaskCompletedSplit`、`MessageContentList`、`OutputFilesCollapse`、`ChatCompletedResult`、`SuggestedQuestions` | 格式化耗时，维护每个任务的折叠状态、输出文件和推荐追问，配置预览、下载、反馈等业务动作 |

宿主从同一个归并后的对话状态生成时间线和专家区 props。时间线回调返回 `{ kind, id }`，区分派发记录与独立回复。FinPlus 补齐 `taskId`、`answerId`、`runId` 后定位执行记录。专家面板的 `taskId` 指当前执行项，可使用 `${kind}:${id}`。切换专家后由宿主决定默认任务。过程内容可按任务标识设置 React key，折叠状态可按任务保存。

FinPlus 的普通回答和 OPC 回答共用 `Message` 与 `TaskDetail.messages`。普通正文读 `contentList`。`opc_assistant` 正文读 `opcTimeline`，其中的有序事件供时间线展示，派发与回复索引供抽屉定位尚无回传事件的任务及归档后的同一次执行。异常、上传和产出文件、反馈、推荐追问沿用公共消息字段，执行用量和完成结果沿用 `contentList`。

实时流和历史使用同一套展示结构。Kit 由宿主按消息角色组合 `MessageItem → OpcAnswer → OpcTimeline`，并复用共享的回答页脚。`OpcRound` 继续提供整轮布局。当前流式团长块传 `isStreaming`，执行过程的活动内容 ID 交给 `MessageContentList`。分页滚动、抽屉和分享路由由宿主负责。Kit OPC 示例见[组件文档](docs/reference/opc.md)。

## 日常验证

```bash
pnpm check
```

执行顺序：`typecheck` → `check:boundaries` → `test` → `build:lib` → `verify:exports` → `verify:consumer`。任一步失败会中断；不 watch、不发布、不构建站点。修改 docs 或站点配置时另运行：

```bash
pnpm docs:build
```

库构建输出 `dist/`，文档构建输出 `site-dist/`。文档使用公开包路径的源码 alias，不依赖已有 dist；它通过并不能证明发布包可被外部消费。构建隔离涉及入口或输出配置时，需额外验证：无 dist 时文档仍可构建、文档构建不修改 dist、库构建不修改 site-dist。

## 测试如何扩展

- `pnpm test` 使用 Node 内置测试运行器执行 `tests/*.test.mjs`，覆盖工程边界、消息渲染与扩展、过程拆分、受控折叠及回调。交互测试通过 happy-dom 在进程内运行。
- 新增纯函数时，在 tests 中补输入、输出、异常和边界断言，脱离 FinPlus 的服务、store 和页面类型；业务逻辑的单元测试应直接验证行为，不能只断言构建成功。
- 新增解析器时，覆盖字段缺失、字段名不匹配、空值、无效输入和合法结构变体。
- 新增 UI 行为时再选择所需的组件/DOM 测试工具；当前 SSR 只检查静态 props 渲染，不覆盖点击、焦点、输入法、滚动或可访问性交互。
- 新测试文件位于当前 glob 以外或需要 TSX 转换时，应同时扩展测试命令；不宣称当前 Node 测试入口已经提供 TSX/DOM 测试环境。

## 包消费验证

`pnpm build:lib` 后运行 `pnpm verify:consumer`。脚本执行以下步骤：

1. 在临时目录生成真实 npm tarball，检查只包含 dist、package.json 及 README/许可等允许元信息；跳过重复 prepack。
2. 临时消费者声明 React 18、Ant Design v4、图标 peer 和 React 类型，用 npm 安装 tarball，不执行生命周期脚本；优先使用缓存，缺失时访问配置的 registry。断言普通依赖自动安装，检查纯 core 的 Node 导入和无 DOM 的 NodeNext 声明。
3. 检查公开 UI 声明、错误 props 的类型反例、SSR 与宿主 ConfigProvider 继承。通过 Vite 应用构建确认 Kit CSS 由首屏 HTML 加载，UI 可独立懒加载。UI 类型使用 Bundler 解析。
4. 将 tarball 替换为 Kit 目录 symlink，将消费者的 peer 运行时与类型链接到同一本地版本，再检查 core、UI 声明、SSR、CSS 和 Vite 构建；Vite dedupe 覆盖 React、React DOM、antd 与图标。
5. 无论成功或失败，清理本次临时目录，不触碰真实 FinPlus 的 node_modules 或全局 npm link。

临时消费者用于工程测试。文档中的消息组合与内容扩展示例基于已验证的 FinPlus 适配方式，通过公开包路径引用源码。

| 已覆盖场景 | 当前验证方式 |
| --- | --- |
| 无 React/DOM 的纯 ESM core | tarball 消费、Node 运行和严格声明检查；另有 dist 隔离导入 |
| React 18 + Vite 6 UI | tarball 与目录 symlink；Bundler 声明、SSR 和 CSS 构建 |
| 公开类型约束 | 正常调用通过，错误 core 返回赋值/错误 title 使用 `@ts-expect-error` 确认拒绝 |
| 包内容隔离 | 真实 tarball 白名单，排除测试、脚本、文档站和缓存 |

已有库检查的本地验证环境为 Node 25.7.0、pnpm 8.12.1、npm 11.10.1。文档站构建另在 Node 22.9.0 下通过；Node 25.7.0 下，dumi/Umi 的间接依赖会报 `No such module: http_parser`，需切换到已验证的 Node 22 环境再构建文档。这里记录的是验证环境，不推断最低 Node 版本。

未覆盖其他 Node/React/构建器、UI NodeNext 类型解析、CJS、pnpm 消费方 link/unlink、浏览器交互及内网 registry/发布流水线。离线消费检查依赖仓库已经安装好锁定的开发依赖，不验证从空缓存经 registry 安装依赖的过程。

## 后续业务迁移准入

下一步先选一个已经稳定的小能力，确认真实输入/输出、对象写入所有权、错误行为和脱敏夹具；核对最新 FinPlus 实现后再设计公共模型。SSE、历史解析和 UI 按各自行为拆任务，共享算法只抽一次。

重新接入 UI 前，检查宿主主题映射、首屏 CSS 加载与真实消息场景。后续 SSE、历史解析等能力继续分别设计和验证，公共模型随实际需求演进。
