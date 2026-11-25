import { useState } from 'react';
import {
  MessageContentList, MessageItem, OpcAnswer, OpcExpertPanel, StreamingMarkdownRenderer,
  TaskCompletedSplit, UserMessage, type OpcExpertMember, type OpcTimelineEntry, type OpcStatusProps,
} from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

const members: OpcExpertMember[] = [
  { id: 'research', name: '资料专家' },
  { id: 'writing', name: '写作专家' },
];
const completed = { status: 'completed', label: '已回传团长' } satisfies OpcStatusProps;
const running = { status: 'running', label: '执行中' } satisfies OpcStatusProps;
const tasks = [
  { id: 'assignment:collect', memberId: 'research', prompt: '收集各议题的最新进展', status: completed, conclusion: '已汇总 **3 项议题**的进展。' },
  { id: 'assignment:verify', memberId: 'research', prompt: '核对每项议题的负责人和截止日期', status: completed, conclusion: '负责人和截止日期均已核对。' },
  { id: 'reply:draft', memberId: 'writing', prompt: '编写会议简报', status: running },
];
const timeline: OpcTimelineEntry[] = [
  { id: 'opening', kind: 'leader', name: '协作团长', content: '先收集和核对议题，再据此整理简报。' },
  {
    id: 'research-tasks', kind: 'dispatch',
    assignments: [
      { id: 'collect', member: members[0].name, prompt: tasks[0].prompt, status: completed },
      { id: 'verify', member: members[0].name, prompt: tasks[1].prompt, status: completed },
    ],
  },
  {
    id: 'research-report', kind: 'report', name: members[0].name, status: completed,
    content: tasks[0].conclusion, target: { kind: 'assignment', id: 'collect' },
  },
  {
    id: 'draft-report', kind: 'report', name: members[1].name, status: running,
    target: { kind: 'reply', id: 'draft' },
  },
];

const questions = [{
  id: 'format',
  type: 'ASK_USER_QUESTION',
  question: '简报最后附上哪种清单？',
  options: [{ id: 'actions', text: '待办事项' }],
  userAnswer: { optionId: 'actions' },
}];

export default function OpcConversation() {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = tasks.find(({ id }) => id === selectedId);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <MessageItem role="user">
        <UserMessage content="请整理本周会议简报。" />
      </MessageItem>
      <MessageItem role="opc_assistant">
        <OpcAnswer
          timeline={timeline}
          contentList={questions}
          onOpenExecution={({ kind, id }) => setSelectedId(kind + ':' + id)}
        />
      </MessageItem>
      {selected && (
        <OpcExpertPanel
          members={members}
          memberId={selected.memberId}
          tasks={tasks.filter(({ memberId }) => memberId === selected.memberId)}
          taskId={selected.id}
          onMemberChange={(id) => setSelectedId(tasks.find(({ memberId }) => memberId === id)?.id)}
          onTaskChange={setSelectedId}
          status={selected.status}
          headerAction={<button type="button" onClick={() => setSelectedId(undefined)}>关闭详情</button>}
          style={{ maxHeight: 360, border: '1px solid var(--finwork-border-color, #e8e8e8)' }}
        >
          <TaskCompletedSplit
            key={selected.id}
            title="执行过程"
            destroyInactivePanel
            process={(
              <MessageContentList
                list={[
                  { id: `${selected.id}-think`, type: 'THINK_MSG', content: selected.prompt },
                  {
                    id: `${selected.id}-tool`,
                    type: 'TOOL_CALL',
                    tool_call_name: 'WRITE_TEXT_FILE',
                    state: 'success',
                    input: { file_path: `/workspace/${selected.memberId}/output.md` },
                    output: `已写入 /workspace/${selected.memberId}/output.md`,
                  },
                ]}
              />
            )}
            conclusion={selected.conclusion ? (
              <section>
                <h3>结论</h3>
                <StreamingMarkdownRenderer content={selected.conclusion} />
              </section>
            ) : <p>等待专家输出</p>}
          />
        </OpcExpertPanel>
      )}
    </div>
  );
}
