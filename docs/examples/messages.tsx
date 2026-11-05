import { AiMessage, MessageContentList, UserMessage } from '@lz19.02/finwork-kit/chat/ui';
import type { MessageContent } from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

const list: MessageContent[] = [
  { id: 'think', type: 'THINK_MSG', content: '整理问题中的关键事项，生成可执行的工作清单。' },
  { id: 'answer', type: 'ASSISTANT_MSG', content: '**处理结果**\n\n- 核对输入资料\n- 整理执行步骤\n- 确认最终交付物' },
];

export default function Messages() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <UserMessage content="请帮我整理本次任务的工作清单。" />
      <AiMessage>
        <MessageContentList list={list} />
      </AiMessage>
    </div>
  );
}
