import { AiMessage, MessageItem, SystemMessage, UserMessage } from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

export default function MessageLayout() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SystemMessage>会话已创建</SystemMessage>
      <MessageItem role="user" footer={<small>刚刚</small>}>
        <UserMessage content="请整理会议纪要。" skillName="会议助手" />
      </MessageItem>
      <AiMessage title="会议助手" footer="处理完成">
        已整理会议议题、结论与待办。
      </AiMessage>
      <h3>助手状态</h3>
      <AiMessage connecting>正在建立连接。</AiMessage>
      <AiMessage processing>正在整理会议纪要。</AiMessage>
      <AiMessage error="示例错误：资料读取失败，请重试。" />
      <h3>长消息折叠</h3>
      <UserMessage content={<div style={{ whiteSpace: 'pre-line' }}>{'请核对会议议题、负责人和截止日期。\n'.repeat(24)}</div>} />
    </div>
  );
}
