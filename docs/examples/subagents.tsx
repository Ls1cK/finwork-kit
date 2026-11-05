import { useState } from 'react';
import { MultiSubAgentCard, SubAgentListItem } from '@lz19.02/finwork-kit/chat/ui';
import type { SubAgent } from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

const agents: SubAgent[] = [
  { id: 'research', random_number: 0, description: '资料检索', prompt: '检索与会议主题相关的资料。' },
  { id: 'summary', random_number: 150, description: '摘要整理', excuting: true },
];

export default function SubAgents() {
  const [selected, setSelected] = useState('尚未选择智能体');
  const select = (agent: SubAgent) => setSelected(`已选择 ${agent.description}`);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <MultiSubAgentCard subagents={agents} onSelect={select} />
      <SubAgentListItem subagent={agents[0]} label="检索助手" onSelect={select} />
      <h3>创建中</h3>
      <MultiSubAgentCard subagents={[{ id: 'creating', description: '正在准备资料助手', creating: true }]} />
      <h3>任务结束与自定义颜色</h3>
      <MultiSubAgentCard subagents={[agents[0]]} onSelect={select} />
      <SubAgentListItem subagent={agents[0]} color="#1890ff" label="资料助手" onSelect={select} />
      <h3>窄容器与长描述</h3>
      <div style={{ width: 280, maxWidth: '100%' }}>
        <SubAgentListItem subagent={{ ...agents[0], description: '检索并整理会议全部议题、负责人以及截止日期' }} onSelect={select} />
      </div>
      <small role="status">{selected}</small>
    </div>
  );
}
