---
title: 对接组件
description: 将实时与历史轮次接到普通消息、引用、OPC 时间线和执行详情。
---

# 对接组件

实时流和历史回放使用同一套渲染函数。按 `state.kind` 区分普通对话和 OPC。把原始快照保存在应用里，在渲染层从快照取数据，便于后续事件继续归并。

## 普通对话

`state.contentList` 可以直接传给 `MessageContentList`，`activeContentId` 指定正在输出的条目。组件按整轮回答计算引用编号。下方示例用 SDK 的 `referenceList` 提供来源弹层，并用 `conclusionId`、`processTitle` 控制可选的过程拆分。

```tsx | pure
import type { OrdinaryRoundState } from '@lz19.02/finwork-kit/chat/core-sse';
import { AiMessage, MessageContentList, ReferenceAnchor } from '@lz19.02/finwork-kit/chat/ui';

export function OrdinaryAnswer({
  state,
  conclusionId,
}: {
  state: OrdinaryRoundState;
  conclusionId?: string;
}) {
  const sources = new Map(state.referenceList?.map((source) => [source.referenceId, source]));
  const duration = state.completion?.durationSeconds;

  return (
    <AiMessage error={state.status === 'error' ? state.error : undefined}>
      <MessageContentList
        list={state.contentList}
        streamingAssistantContentId={state.activeContentId}
        conclusionId={conclusionId}
        processTitle={duration === undefined ? '执行过程' : `执行过程 · ${duration} 秒`}
        renderReference={(anchor) => {
          const source = sources.get(anchor.referenceId);
          if (!source) return null;
          return (
            <ReferenceAnchor
              anchor={anchor}
              title={source.toolCallName}
              contents={source.references.map(({ published_at, ...item }) => ({
                ...item,
                content: item.content ?? item.summary,
                publishedAt: published_at,
              }))}
            />
          );
        }}
      />
    </AiMessage>
  );
}
```

- `conclusionId` 对应这轮最后需要独立展示的条目 ID。未指定时列表按原顺序展示，可在应用确定结论后再传入。
- 把 `state.pendingQuestion` 用于当前输入区。已经提交的答复在 `contentList` 中由 `AskUserQuestionContent` 回显。提交方式见[提交追问答案](/sdk/overview#提交追问答案)。
- 回放历史时，用 `round.question` 和 `round.uploadFiles` 组合 `UserMessage` 与 `MessageFileList`，把 `round.state` 传给对应回答组件。产出文件分别从 `round.outputFiles`、`round.outputPkgFiles` 和 `round.outputSkillPkgFiles` 读取。
- 文件、反馈和后续操作可以组合在 `AiMessage.output`、`footer` 和 `suggestions`。参考[文件展示](/reference/files)与[消息操作](/reference/actions)。

## OPC 时间线与详情

`groupOpcTimeline(state)` 将 `state.timeline` 聚合为有序的团长过程/正文、同回复派发卡片与团员汇报，`isOpcBlockStreaming(block)` 用于判断过程块是否仍在流式执行。状态文案可由应用统一配置。

```tsx | pure
import { useState } from 'react';
import {
  groupOpcTimeline,
  isOpcBlockStreaming,
  resolveOpcExecution,
  type OpcReply,
  type OpcRoundState,
} from '@lz19.02/finwork-kit/chat/core-sse';
import {
  MessageContentList,
  OpcAnswer,
  type OpcExecutionTarget,
  type OpcStatusProps,
  type OpcTimelineEntry,
} from '@lz19.02/finwork-kit/chat/ui';

const labels = {
  idle: '等待执行',
  running: '执行中',
  completed: '已完成',
  cancelled: '已取消',
  uncompleted: '未完成',
  error: '执行失败',
};

function describeStatus(status: OpcReply['status'] | 'idle'): OpcStatusProps {
  return { status, label: labels[status] };
}

export function toOpcTimeline(state: OpcRoundState): OpcTimelineEntry[] {
  return groupOpcTimeline(state).map<OpcTimelineEntry>((entry) => {
    if (entry.kind === 'dispatch') {
      const assignments = entry.assignmentIds.flatMap((id) => {
        const task = state.assignments[id];
        if (!task) return [];
        const reply = task.replyId ? state.replies[task.replyId] : undefined;
        return [{
          id,
          member: reply?.name ?? task.member,
          avatarUrl: reply?.avatarUrl,
          prompt: task.prompt,
          status: describeStatus(reply?.status ?? 'idle'),
        }];
      });
      return { id: entry.id, kind: 'dispatch', name: entry.reply?.name, avatarUrl: entry.reply?.avatarUrl, assignments };
    }

    if (entry.kind === 'leader') {
      const isStreaming = entry.reply.status === 'running' && entry.content.some(isOpcBlockStreaming);
      const conclusion = isStreaming
        ? undefined
        : entry.content.find((block) => block.type === 'ASSISTANT_MSG' && block.content.trim());
      const processBlocks = entry.content.filter((block) => block !== conclusion);
      return {
        id: entry.id,
        kind: 'leader',
        name: entry.reply.name,
        avatarUrl: entry.reply.avatarUrl,
        isStreaming,
        process: processBlocks.length > 0 ? <MessageContentList list={processBlocks} /> : undefined,
        conclusion: conclusion ? <MessageContentList list={[conclusion]} /> : undefined,
      };
    }

    const target = { kind: 'reply', id: entry.reply.id } as const;
    const assignment = resolveOpcExecution(state, target)?.assignment;
    const contents = entry.reply.blocks.flatMap((block) =>
      block.type === 'ASSISTANT_MSG' && block.content.trim()
        ? [{ id: block.id, content: block.content, isStreaming: block.streaming }]
        : [],
    );
    return {
      id: entry.id,
      kind: 'report',
      name: entry.reply.name,
      avatarUrl: entry.reply.avatarUrl,
      contents,
      content: contents.length === 0 ? assignment?.result?.text : undefined,
      status: describeStatus(entry.reply.status),
      target,
    };
  });
}

export function OpcAnswerWithDetails({ state }: { state: OpcRoundState }) {
  const [target, setTarget] = useState<OpcExecutionTarget>();
  const execution = target ? resolveOpcExecution(state, target) : undefined;

  return (
    <>
      <OpcAnswer
        timeline={toOpcTimeline(state)}
        contentList={state.contentList}
        error={state.error}
        onOpenExecution={setTarget}
      />
      {execution?.reply && <MessageContentList list={execution.reply.blocks} />}
      {execution?.assignment && !execution.reply && <p>{execution.assignment.prompt}</p>}
    </>
  );
}
```

渲染多轮时，用稳定的 `roundKey` 作为 `OpcAnswerWithDetails` 的 React key。这样切换轮次时，上一轮选中的执行项随组件一起重置。派发项可能在专家回复建立前就可点击，此时 `resolveOpcExecution` 只返回 `assignment`，可以先展示任务描述。

需要专家和任务选择器时，将这段详情区换成 `OpcExpertPanel`。给 `members` 传专家列表，给 `tasks` 传当前专家的任务列表。面板会回传专家 ID 和任务 ID。用同一套 target 恢复选中的任务，把执行块交给面板的 `children`；当专家回复仍在流式输出时建议直接平铺展示执行过程，完成后再通过 `TaskCompletedSplit` 折叠过程、突出结论。正在更新的块可通过 `isOpcBlockStreaming(block)` 选出，并将其 ID 传给详情列表的 `streamingAssistantContentId`。[OPC 组件页](/reference/opc)有可操作的面板示例。
