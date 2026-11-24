import type { ReactNode, Ref } from 'react';
import { Empty, Select } from 'antd';
import type { MessageAppearanceProps } from '../message/types';
import { OpcAvatar, OpcStatus, type OpcStatusProps } from './OpcIdentity';
import styles from './opc.module.less';

export interface OpcExpertMember {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface OpcExpertTask {
  id: string;
  prompt?: string;
}

export interface OpcExpertPanelProps extends MessageAppearanceProps {
  members: readonly OpcExpertMember[];
  memberId?: string;
  onMemberChange: (id: string) => void;
  tasks: readonly OpcExpertTask[];
  taskId?: string;
  onTaskChange: (id: string) => void;
  status?: Pick<OpcStatusProps, 'status' | 'label'>;
  headerAction?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  contentRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

export function OpcExpertPanel({
  members, memberId, onMemberChange, tasks, taskId, onTaskChange, status,
  headerAction, scrollRef, contentRef, children, className, style,
}: OpcExpertPanelProps) {
  const member = members.find(({ id }) => id === memberId);
  const task = tasks.find(({ id }) => id === taskId);

  return (
    <div className={`${styles.expertPanel} ${className ?? ''}`} style={style}>
      <header className={styles.panelHeader} aria-label="专家执行">
        <div className={styles.memberSelection}>
          <OpcAvatar src={member?.avatarUrl} size={28} />
          {members.length > 0 ? (
            <Select<string>
              className={styles.expertSelect}
              aria-label="选择专家"
              dropdownMatchSelectWidth={false}
              value={member?.id ?? null}
              onChange={onMemberChange}
              options={members.map(({ id, name }) => ({ value: id, label: name }))}
              placeholder="选择专家"
            />
          ) : <span className={styles.panelTitle}>专家执行</span>}
        </div>
        {headerAction}
      </header>
      {task && member ? (
        <>
          <div className={styles.taskBar}>
            <Select<string>
              key={member.id}
              className={styles.taskSelect}
              popupClassName={styles.taskMenu}
              aria-label="选择任务"
              value={task.id}
              onChange={onTaskChange}
              dropdownMatchSelectWidth={false}
              options={tasks.map(({ id, prompt }, index) => {
                const number = String(index + 1).padStart(2, '0');
                const title = prompt?.trim().replace(/\s+/g, ' ') || '任务详情';
                return {
                  value: id,
                  title,
                  'aria-label': `任务 ${number}，${title}`,
                  label: (
                    <span className={styles.taskMenuItem}>
                      <span className={styles.taskNumber}>#{number}</span>
                      <span className={styles.taskLabel} title={title}>{title}</span>
                    </span>
                  ),
                };
              })}
            />
            {status && <OpcStatus {...status} />}
          </div>
          <div className={styles.scroll} ref={scrollRef}>
            <div ref={contentRef}>{children}</div>
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无专家执行记录" />
        </div>
      )}
    </div>
  );
}
