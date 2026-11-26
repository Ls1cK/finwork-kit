---
title: SDK
description: 归并流式事件、恢复历史轮次并接入对话组件。
---

# SDK

SDK 提供普通对话和 OPC 协作对话的单轮归并。实时流和历史回放都生成 `RoundState`。宿主保存状态快照，负责请求、鉴权、攒批、取消和界面操作。

接入顺序是初始化轮次、送入事件、提交快照、渲染。[对接组件](/sdk/components)展示从普通或 OPC 快照到组件 props 的完整映射。已有历史数据的页面可以直接从[回放历史对话](#回放历史对话)开始。

| 函数 | 何时调用 | 返回值 |
| --- | --- | --- |
| `createRound({ kind, roundKey })` | 发起一轮普通或 OPC 对话 | 初始 `RoundState` |
| `decodeFrame(data, options?)` | 解析一帧 SSE 的 JSON 字符串或已解析对象 | 成功返回 `event`，失败返回 `issue` |
| `reduceRound(state, events)` | 更新一个轮次，包括用户作答和连接收尾 | 新 `state` 与 `intents` |
| `reduceStreamBatch(targets, frames, options?)` | 批量解码、归并有序帧或同时处理多个任务 | `updates`、有序 `intents` 和 `issues` |
| `resolveOpcExecution(state, target)` | 从派发项或回复定位 OPC 详情 | `{ assignment?, reply? }`，找不到时返回 `undefined` |
| `parseDetailFrames(answer)` | 检查一段历史的帧边界与 JSON | `{ frames, issues }` |
| `replayTaskRecords(records, options?)` | 将历史记录恢复为可渲染的轮次 | `{ kind, rounds, issues }` |

前五个函数从 `@lz19.02/finwork-kit/chat/core-sse` 导入，后两个从 `@lz19.02/finwork-kit/chat/core-detail` 导入。SDK 使用 ESM 和 TypeScript 声明，可以独立用于 Node 或前端应用。

## 处理流式对话

发起一轮时用稳定的 `roundKey` 创建状态，并传入 `kind: 'ordinary'` 或 `kind: 'opc'`。可以将宿主的回答 ID 用作 `roundKey`。将 SSE 客户端解包后的 `event.data` 或已解析对象逐帧传给 `decodeFrame`，输入中应包含 `type`。一批事件按接收顺序传给 `reduceRound`，再提交返回的 `state`。

```ts
import {
  createRound, decodeFrame, reduceRound,
  type RoundState,
} from '@lz19.02/finwork-kit/chat/core-sse';

function applyBatch(previous: RoundState, payloads: readonly unknown[]) {
  const decoded = payloads.map((payload) => decodeFrame(payload));
  const events = decoded.flatMap((result) => result.ok ? [result.event] : []);
  const issues = decoded.flatMap((result) => result.ok ? [] : [result.issue]);
  return { ...reduceRound(previous, events), issues };
}

const round = createRound({ kind: 'ordinary', roundKey: 'chat-1' });
const { state, intents, issues } = applyBatch(round, [
  '{"type":"ASSISTANT_MSG","text_delta":"你好"}',
]);
```

- `decodeFrame` 返回 `{ ok: true, event }` 或 `{ ok: false, issue }`。诊断代码有 `invalid_json`、`invalid_frame`、`unknown_frame`。缺少合法终态的 `TASK_COMPLETED` 会返回 `invalid_frame`。宿主可以记录诊断并继续消费后续有效帧。
- 字符串 `content` 表示完整快照，只有 `text_delta` 时按顺序追加并保留空白。普通对话实时流里，旧协议的纯空白正文快照不会覆盖已有正文。工具参数按快照读取。
- `reduceRound` 返回下一状态和 `intents`，保留旧快照。普通和 OPC 都支持浏览器开关、用量、引用和用户追问。用户答复通过 `{ kind: 'user.answer', sourceId, optionId, userMessage }` 写回，运行中的追问保存在 `pendingQuestion`，已答内容保存在 `contentList`。
- 输入关闭前消费已排队的帧，再传入 `{ kind: 'input.end', reason: 'closed' }`。取消或连接失败分别传 `cancelled` 和 `failed`，失败时可带 `error`。显式的 `TASK_COMPLETED` 终态优先保留；正常关闭但缺少终态时标记为 `uncompleted`。

宿主以每次请求和轮次为单位接收事件，连接重试与精确重放去重由宿主结合服务端游标处理。重复送入同一条 `text_delta` 会重复追加。连接结束后仍需提交 `input.end`，这样缺少终态的轮次也能停止流式展示。

### 批量处理与收尾

`reduceStreamBatch(targets, frames, options?)` 接收每个任务的当前回答快照和有序帧队列。宿主在入队时记录 `taskId`、`answerId` 和 `data`。同批的普通及 OPC 帧按任务归并，错配回答和已关闭回答的帧会被跳过。仅发生变化的快照进入 `updates`，`intents` 按原始到达顺序返回，诊断与意图均携带任务、回答和原始帧下标 `order`。

```ts
import { createRound, reduceStreamBatch } from '@lz19.02/finwork-kit/chat/core-sse';

const target = { taskId: 'task', answerId: 'answer', state: createRound({ kind: 'opc', roundKey: 'answer' }) };
const { updates, intents, issues } = reduceStreamBatch(
  [{ ...target, end: { kind: 'input.end', reason: 'closed' } }],
  [{ taskId: 'task', answerId: 'answer', data: '{"type":"TASK_COMPLETED","status":"success"}' }],
);
```

`end` 只作用于本次批次。`closed` 先消费该回答的队列尾帧，再关闭输入。`cancelled` 和 `failed` 直接关闭输入，丢弃尚未提交的帧及其动作。宿主根据返回的回答 ID 提交快照，再按顺序执行浏览器动作。浏览器工作区、进度文件路径、请求重试及本地回放调度由宿主管理。

在回调里使用**打开连接时捕获的 `taskId` 和 `answerId`**标记入队帧。提交 `updates`、执行 `intents` 前，再核对它们的 `answerId` 仍属于该任务。若任务已开启新一轮，旧连接的尾帧和关闭回调都应跳过。同一批只给每个任务传一份当前快照。空队列也可以通过 `end` 收尾。

### 提交追问答案

`pendingQuestion` 包含协议 ID、问题、选项及可选的自由输入配置。应用据此渲染输入区并调用提交接口。接口成功后读取最新快照，确认仍是原轮次、原问题，再用 `user.answer` 写回。传入的是 `pendingQuestion.id`，该值对应协议的 `sourceId` 与历史记录的 `chunkId`。组件用于渲染的内容块 `id` 与它可能不同。

```ts
import { reduceRound, type RoundState } from '@lz19.02/finwork-kit/chat/core-sse';

export function applyConfirmedAnswer(
  current: RoundState,
  submitted: { roundKey: string; sourceId: string; optionId?: string; userMessage?: string },
) {
  if (current.roundKey !== submitted.roundKey || current.pendingQuestion?.id !== submitted.sourceId) {
    return current;
  }
  return reduceRound(current, [{
    kind: 'user.answer',
    sourceId: submitted.sourceId,
    optionId: submitted.optionId,
    userMessage: submitted.userMessage,
  }]).state;
}
```

## 回放历史对话

`replayTaskRecords(records, options?)` 接收按顺序排列的任务对话记录。每条记录至少包含 `chatId` 和 `question`，可传入 `answer`、文件、反馈和 `chatAnswerList`。已知对话类型时可显式传入 `kind`；省略时，从有效的 OPC 回复开始帧推断，否则按普通对话恢复。

```ts
import { replayTaskRecords } from '@lz19.02/finwork-kit/chat/core-detail';

const { rounds, issues } = replayTaskRecords([
  {
    chatId: 'chat-1',
    question: '请汇总处理结果',
    answer: '<data>{"type":"ASSISTANT_MSG","content":"汇总已完成"}</data>'
      + '<data>{"type":"TASK_COMPLETED","status":"success"}</data>',
  },
]);
```

回放复用同一归并器，按历史数据规则恢复块顺序、用户问答和元数据。普通与 OPC 记录均按 `chatId`、`chunkId` 和 `chunkType` 回填用户回答。历史更新浏览器快照，浏览器开关动作仅来自实时归并。回放输出按轮次归类的上传文件、产出文件、产出压缩包与技能包，并保留传入文件的自定义字段。

`parseDetailFrames(answer)` 适用于单独检查 `<data>...</data>` 包裹的帧。它返回 `{ frames, issues }`，每条诊断含从零计数的 `frameIndex` 与原字符串的 `offset`。完整的非法 JSON、无效帧和缺少结束标签的尾帧分别记录诊断，可恢复的帧仍参与回放。`replayTaskRecords` 的诊断还带有 `recordIndex` 和 `chatId`。宿主据此选择显示部分结果或提示失败。

| 场景 | 接入处理 |
| --- | --- |
| 没有历史记录，或有提问但尚未保存回答 | 没有诊断时按空历史、待回答或正常历史展示。每条记录都会生成一轮。 |
| 有坏帧，但仍有内容或文件 | 保留可恢复结果，使用 `chatId`、`recordIndex`、`frameIndex`、`offset` 和 `code` 记录诊断。 |
| 有坏帧，且没有任何可恢复内容 | 在界面上展示加载失败，并保留重试入口。 |

判断能否恢复时检查实际正文、OPC 时间线、元数据和文件。`rounds.length` 只代表历史记录条数。文件以 `fileSource` 分类，`IN-01` 和 `OUT-06` 为上传文件，`OUT-01` 为产出文件，`OUT-02` 为产出包，`OUT-03` 为技能包。缺少来源分类的文件仍在 `files` 中。

## 接入自定义内容

`mapCustomFrame` 可以把未知的协议帧映射为业务内容，返回带有 `id` 和 `type` 的 block。可在实时解码和历史回放中使用同一个映射函数。仅当映射自身也保持纯函数时，相同输入才可稳定复现结果。

```ts
import {
  createRound, decodeFrame, reduceRound,
  type DecodeFrameOptions,
} from '@lz19.02/finwork-kit/chat/core-sse';

type AuditNote = {
  id: string;
  type: 'AUDIT_NOTE';
  auditId: string;
  content: string;
};

const options: DecodeFrameOptions<AuditNote> = {
  mapCustomFrame(frame) {
    if (frame.type !== 'AUDIT_NOTE' || typeof frame.id !== 'string'
      || typeof frame.auditId !== 'string' || typeof frame.content !== 'string') {
      return undefined;
    }
    return {
      kind: 'content',
      block: { id: frame.id, type: 'AUDIT_NOTE', auditId: frame.auditId, content: frame.content },
    };
  },
};

const round = createRound<AuditNote>({ kind: 'ordinary', roundKey: 'chat-1' });
const result = decodeFrame({ type: 'AUDIT_NOTE', id: 'note-1', auditId: 'audit-1', content: '已复核' }, options);
const next = result.ok ? reduceRound(round, [result.event]).state : round;
```

普通对话把自定义块插入 `contentList`，可由 `MessageContentList` 的 `renderers` 按类型展示。OPC 的自定义块存于轮次或指定回复的 `customContent`，映射时用 `replyId` 指定已存在的回复。

## 对接组件

| 轮次类型 | SDK 数据 | 组件适配 |
| --- | --- | --- |
| 普通对话 | `state.contentList`、`activeContentId`、`completion` | `contentList` 对应 `MessageContentList.list`，`activeContentId` 对应 `streamingAssistantContentId`。按宿主交互规则提供 `conclusionId`。 |
| OPC 协作对话 | `state.timeline`、`replies`、`assignments`、`contentList` | 宿主按 `opc_assistant` 角色将时间线条目和公共追问传给 `OpcAnswer`。打开详情时用 `resolveOpcExecution(state, target)` 从派发或回复定位专家和任务，把结果传入 `OpcExpertPanel`。 |

组件所需的状态文案、选中值、交互回调和渲染插槽由宿主提供。参见[对接组件](/sdk/components)的普通对话和 OPC 映射示例，再按需查阅[消息内容](/reference/content)和[OPC 协作对话](/reference/opc)的属性表。
