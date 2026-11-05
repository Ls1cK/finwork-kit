import { useState } from 'react';
import { LikeOutlined, DislikeOutlined } from '@ant-design/icons';
import {
  ChatCompletedResult, MessageActions, SuggestedQuestions,
} from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

export default function MessageActionDemo() {
  const [status, setStatus] = useState('等待操作');
  const [feedback, setFeedback] = useState<'up' | 'down'>();
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <MessageActions actions={[
        { key: 'up', label: '点赞', icon: <LikeOutlined />, active: feedback === 'up', onClick: () => { setFeedback('up'); setStatus('宿主收到点赞回调，可在此打开业务反馈弹窗。'); } },
        { key: 'down', label: '点踩', icon: <DislikeOutlined />, active: feedback === 'down', onClick: () => { setFeedback('down'); setStatus('宿主收到点踩回调，可在此打开业务反馈弹窗。'); } },
      ]} />
      <SuggestedQuestions questions={['继续细化待办', '生成摘要']} onSelect={setStatus} />
      <ChatCompletedResult status="success" message="任务已完成" usage={['耗时 12 秒']} />
      <ChatCompletedResult status="error" message="任务执行失败" />
      <ChatCompletedResult status="timeout" message="任务执行超时" />
      <ChatCompletedResult status="uncompleted" message="任务尚未完成" />
      <small role="status">{status}</small>
    </div>
  );
}
