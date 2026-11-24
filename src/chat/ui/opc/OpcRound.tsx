import { useId, type ReactNode } from 'react';
import { ApartmentOutlined, RightOutlined } from '@ant-design/icons';
import { StreamingMarkdownRenderer } from '../markdown/StreamingMarkdownRenderer';
import { MessageContentList } from '../message/MessageContentList';
import type { MessageAppearanceProps, MessageContent } from '../message/types';
import { OpcAvatar, OpcStatus, type OpcStatusProps } from './OpcIdentity';
import styles from './opc.module.less';

export interface OpcExecutionTarget {
  kind: 'assignment' | 'reply';
  id: string;
}

type ExecutionStatus = Pick<OpcStatusProps, 'status' | 'label'>;

export interface OpcDispatch {
  id: string;
  member: string;
  avatarUrl?: string;
  prompt?: string;
  status: ExecutionStatus;
}

export type OpcTimelineEntry =
  | { id: string; kind: 'leader'; name: string; avatarUrl?: string; content?: string; isStreaming?: boolean }
  | { id: string; kind: 'dispatch'; assignments: readonly OpcDispatch[] }
  | {
      id: string; kind: 'report'; name: string; avatarUrl?: string; content?: string;
      status: ExecutionStatus; note?: string; target: OpcExecutionTarget;
    };

export interface OpcTimelineProps extends MessageAppearanceProps {
  timeline: readonly OpcTimelineEntry[];
  onOpenExecution?: (target: OpcExecutionTarget) => void;
}

export interface OpcAnswerProps extends OpcTimelineProps {
  contentList?: readonly MessageContent[];
  error?: string;
  footer?: ReactNode;
}

export interface OpcRoundProps extends OpcAnswerProps {
  id?: string;
  userMessage?: ReactNode;
}

export function OpcRound({ id, userMessage, timeline, contentList, error, footer, onOpenExecution, className, style }: OpcRoundProps) {
  return (
    <section id={id} data-chat-row-id={id} className={`${styles.round} ${className ?? ''}`} style={style}>
      {userMessage}
      <OpcAnswer timeline={timeline} contentList={contentList} error={error} footer={footer} onOpenExecution={onOpenExecution} />
    </section>
  );
}

export function OpcAnswer({ timeline, contentList, error, footer, onOpenExecution, className, style }: OpcAnswerProps) {
  const questions = contentList?.filter(({ type }) => type === 'ASK_USER_QUESTION');
  if (!timeline.length && !questions?.length && !error && footer == null) return null;
  return (
    <div className={`${styles.answer} ${className ?? ''}`} style={style}>
      <OpcTimeline timeline={timeline} onOpenExecution={onOpenExecution} />
      {!!questions?.length && <MessageContentList list={questions} />}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {footer != null && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}

export function OpcTimeline({ timeline, onOpenExecution, className, style }: OpcTimelineProps) {
  const promptIdPrefix = useId();
  if (timeline.length === 0) return null;
  return (
    <ol className={`${styles.events} ${className ?? ''}`} style={style} aria-label="协作时间线" role="list">
      {timeline.map((entry, entryIndex) => (
        <li className={styles.event} data-kind={entry.kind} key={entry.id}>
          <span className={styles.eventIcon} aria-hidden="true">
            {entry.kind === 'dispatch' ? <ApartmentOutlined /> : (
              <OpcAvatar role={entry.kind === 'leader' ? 'leader' : 'worker'} src={entry.avatarUrl} />
            )}
          </span>
          <div className={styles.eventBody}>
            {entry.kind === 'dispatch' ? (
              <div className={styles.dispatchCard}>
                <div className={styles.cardHeading}>
                  <div className={styles.heading}>
                    <h2>任务派发</h2>
                    <span className={styles.eventRole}>系统</span>
                  </div>
                  <span className={styles.meta}>{entry.assignments.length} 项任务</span>
                </div>
                <ul className={styles.dispatches} role="list">
                  {entry.assignments.map((task, taskIndex) => {
                    const promptId = `${promptIdPrefix}-${entryIndex}-${taskIndex}`;
                    return (
                      <li className={styles.dispatch} key={task.id}>
                        <div className={styles.dispatchHeading}>
                          <div className={styles.dispatchIdentity}>
                            <OpcAvatar src={task.avatarUrl} size={24} />
                            <strong>{task.member}</strong>
                          </div>
                          <OpcStatus
                            {...task.status}
                            action={onOpenExecution && {
                              member: task.member,
                              onClick: () => onOpenExecution({ kind: 'assignment', id: task.id }),
                            }}
                          />
                        </div>
                        {task.prompt && (
                          <details className={styles.dispatchTask}>
                            <summary aria-label={`任务描述 · ${task.member}`} aria-describedby={promptId}>
                              <RightOutlined className={styles.chevron} aria-hidden="true" />
                              <span id={promptId} className={styles.promptText}>{task.prompt}</span>
                            </summary>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : entry.kind === 'leader' ? (
              <>
                <div className={styles.heading}>
                  <h2>{entry.name}</h2>
                  <span className={styles.eventRole}>团长</span>
                </div>
                {entry.content ? (
                  <div className={styles.leaderText}>
                    <StreamingMarkdownRenderer content={entry.content} isStreaming={entry.isStreaming} />
                  </div>
                ) : entry.isStreaming && <p className={styles.waiting}>正在回复</p>}
              </>
            ) : (
              <div className={styles.reportCard}>
                <div className={styles.cardHeading}>
                  <div className={styles.heading}>
                    <h2>{entry.name}</h2>
                    <span className={styles.eventRole}>团员</span>
                    {entry.note && <span className={styles.meta}>{entry.note}</span>}
                  </div>
                  <OpcStatus
                    {...entry.status}
                    action={onOpenExecution && {
                      member: entry.name,
                      onClick: () => onOpenExecution(entry.target),
                    }}
                  />
                </div>
                {entry.content && (
                  <div className={styles.reportBody}>
                    <StreamingMarkdownRenderer content={entry.content} />
                  </div>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
