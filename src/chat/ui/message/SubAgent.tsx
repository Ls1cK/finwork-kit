import type { ReactNode } from 'react';
import { CheckCircleTwoTone, HourglassTwoTone, LoadingOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Popover, Tag } from 'antd';
import { MarkdownViewer } from '../markdown';
import { RandomNumAvatar } from './RandomNumAvatar';
import { MessageCollapse, type MessageCollapseProps } from './MessageCollapse';
import type { MessageAppearanceProps, SubAgent } from './types';
import styles from './message.module.less';

export interface SubAgentListItemProps<T extends SubAgent = SubAgent> extends MessageAppearanceProps {
  subagent: T;
  label?: ReactNode;
  avatar?: ReactNode;
  color?: string;
  prompt?: ReactNode;
  onSelect?: (subagent: T) => void;
}

export function SubAgentListItem<T extends SubAgent>({
  subagent, label = '智能体', avatar, color = '#a30030', prompt, onSelect, className, style,
}: SubAgentListItemProps<T>) {
  return (
    <div className={`${styles.subAgentCard} ${className ?? ''}`} style={style}>
      <Popover
        content={prompt ?? (subagent.prompt ? <MarkdownViewer content={subagent.prompt} /> : undefined)}
        mouseEnterDelay={0.2} mouseLeaveDelay={0.2}
        placement="bottomRight"
        trigger={['hover', 'focus']}
        overlayClassName={styles.promptPopover}
      >
        <span className={styles.subAgentTrigger}>
          <Button
            className={styles.subAgent} style={{ borderColor: color }}
            disabled={!onSelect && !prompt && !subagent.prompt}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onSelect?.(subagent);
            }}
          >
            <span className={styles.avatar}>{avatar ?? (Number.isFinite(subagent.random_number) ? <RandomNumAvatar num={subagent.random_number!} /> : <RobotOutlined style={{ fontSize: 32 }} />)}</span>
            <span className={styles.subAgentInfo}>
              <span>{label}</span>
              <span className={styles.secondary}>{subagent.creating ? '正在创建...' : subagent.description || ' '}</span>
            </span>
            <span className={styles.agentStatus} style={{ color }} aria-label={subagent.creating ? '创建中' : subagent.excuting ? '执行中' : '任务结束'}>
              {subagent.creating ? <LoadingOutlined /> : subagent.excuting ? <HourglassTwoTone spin twoToneColor={color} /> : <><Tag color={color}>任务结束</Tag><CheckCircleTwoTone twoToneColor={color} /></>}
            </span>
          </Button>
        </span>
      </Popover>
    </div>
  );
}

export interface MultiSubAgentCardProps<T extends SubAgent = SubAgent> extends Omit<MessageCollapseProps, 'title' | 'children'> {
  subagents: readonly T[];
  title?: ReactNode;
  onSelect?: (subagent: T) => void;
  renderSubAgent?: (subagent: T, index: number) => ReactNode;
}

export function MultiSubAgentCard<T extends SubAgent>({
  subagents, title, onSelect, renderSubAgent, defaultExpanded = true, ...props
}: MultiSubAgentCardProps<T>) {
  const creating = subagents.length === 0 || subagents.some((agent) => agent.creating);
  const executing = subagents.some((agent) => agent.excuting);
  const label = creating ? '正在创建智能体集群...' : executing ? '智能体集群正在执行任务...' : '智能体集群任务执行结束';
  return (
    <MessageCollapse {...props} className={`${styles.subAgentCollapse} ${props.className ?? ''}`} arrowPlacement="end" title={title ?? <span><span className={styles.clusterStatus}>{creating ? <LoadingOutlined /> : executing ? <HourglassTwoTone spin twoToneColor="#a30030" /> : <CheckCircleTwoTone twoToneColor="#a30030" />}</span>{label}</span>} defaultExpanded={defaultExpanded} ghost={false}>
      <div className={styles.subAgentList}>
        {subagents.map((subagent, index) => (
          <div key={subagent.id}>
            {renderSubAgent ? renderSubAgent(subagent, index) : <SubAgentListItem subagent={subagent} onSelect={onSelect} />}
          </div>
        ))}
      </div>
    </MessageCollapse>
  );
}
