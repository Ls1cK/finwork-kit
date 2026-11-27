import { useId, type ReactNode } from 'react';
import { InfoCircleOutlined, RightOutlined } from '@ant-design/icons';
import { StreamingMarkdownRenderer } from '../markdown/StreamingMarkdownRenderer';
import { MessageCollapse } from '../message/MessageCollapse';
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
  status?: ExecutionStatus;
}

export interface OpcReportContent {
  id: string;
  content: string;
  isStreaming?: boolean;
}

export type OpcTimelineEntry =
  | {
      id: string;
      kind: 'leader';
      name: string;
      avatarUrl?: string;
      content?: string;
      isStreaming?: boolean;
      process?: ReactNode;
      conclusion?: ReactNode;
      processTitle?: ReactNode;
      processExpanded?: boolean;
      defaultProcessExpanded?: boolean;
      onProcessExpandedChange?: (expanded: boolean) => void;
    }
  | {
      id: string;
      kind: 'dispatch';
      name?: string;
      avatarUrl?: string;
      assignments: readonly OpcDispatch[];
    }
  | {
      id: string;
      kind: 'report';
      name: string;
      avatarUrl?: string;
      content?: string;
      contents?: readonly OpcReportContent[];
      roleLabel?: ReactNode;
      status?: ExecutionStatus;
      note?: string;
      target: OpcExecutionTarget;
    };

export interface OpcTimelineProps extends MessageAppearanceProps {
  timeline: readonly OpcTimelineEntry[];
  timelineFooter?: ReactNode;
  onOpenExecution?: (target: OpcExecutionTarget) => void;
}

export interface OpcAnswerProps extends OpcTimelineProps {
  contentList?: readonly MessageContent[];
  error?: string;
  processing?: ReactNode;
  footer?: ReactNode;
}

export interface OpcRoundProps extends OpcAnswerProps {
  id?: string;
  userMessage?: ReactNode;
}

export function OpcRound({
  id, userMessage, timeline, timelineFooter, contentList, error, processing, footer, onOpenExecution, className, style,
}: OpcRoundProps) {
  return (
    <section id={id} data-chat-row-id={id} className={`${styles.round} ${className ?? ''}`} style={style}>
      {userMessage}
      <OpcAnswer
        timeline={timeline}
        timelineFooter={timelineFooter}
        contentList={contentList}
        error={error}
        processing={processing}
        footer={footer}
        onOpenExecution={onOpenExecution}
      />
    </section>
  );
}

export function OpcAnswer({
  timeline, timelineFooter, contentList, error, processing, footer, onOpenExecution, className, style,
}: OpcAnswerProps) {
  const questions = contentList?.filter(({ type }) => type === 'ASK_USER_QUESTION');
  if (
    !timeline.length &&
    timelineFooter == null &&
    !questions?.length &&
    !error &&
    processing == null &&
    footer == null
  ) {
    return null;
  }
  return (
    <div className={`${styles.answer} ${className ?? ''}`} style={style}>
      <OpcTimeline timeline={timeline} timelineFooter={timelineFooter} onOpenExecution={onOpenExecution} />
      {!!questions?.length && <MessageContentList list={questions} />}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {processing != null && <div className={styles.processingIcon}>{processing}</div>}
      {footer != null && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}

export function OpcTimeline({ timeline, timelineFooter, onOpenExecution, className, style }: OpcTimelineProps) {
  const promptIdPrefix = useId();
  if (timeline.length === 0 && timelineFooter == null) return null;
  return (
    <ol className={`${styles.events} ${className ?? ''}`} style={style} aria-label="协作时间线" role="list">
      {timeline.map((entry, entryIndex) => (
        <li className={styles.event} data-kind={entry.kind} key={entry.id}>
          <span className={styles.eventIcon} aria-hidden="true">
            <OpcAvatar
              role={entry.kind === 'report' ? 'worker' : 'leader'}
              src={entry.avatarUrl}
            />
          </span>
          <div className={styles.eventBody}>
            {entry.kind === 'dispatch' ? (
              <div className={styles.dispatchCard}>
                <div className={styles.cardHeading}>
                  <div className={styles.dispatchHeadingTitle}>
                    <div className={styles.heading}>
                      <h2>{entry.name || '团长'}</h2>
                      <span className={styles.eventRole}>团长</span>
                    </div>
                    <p className={styles.dispatchSubtitle}>任务派发</p>
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
                          {(task.status || onOpenExecution) && (
                            <OpcStatus
                              {...(task.status ?? {})}
                              iconOnly
                              action={onOpenExecution && {
                                member: task.member,
                                onClick: () => onOpenExecution({ kind: 'assignment', id: task.id }),
                              }}
                            />
                          )}
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
                {entry.process != null || entry.conclusion != null ? (
                  <div className={styles.leaderText}>
                    {entry.isStreaming
                      ? entry.process
                      : entry.process != null && (
                          <MessageCollapse
                            className={styles.leaderProcessCollapse}
                            title={entry.processTitle ?? '执行过程'}
                            arrowPlacement="inline"
                            destroyInactivePanel
                            expanded={entry.processExpanded}
                            defaultExpanded={entry.defaultProcessExpanded}
                            onExpandedChange={entry.onProcessExpandedChange}
                          >
                            {entry.process}
                          </MessageCollapse>
                        )}
                    {entry.conclusion ??
                      (entry.content && (
                        <StreamingMarkdownRenderer content={entry.content} isStreaming={entry.isStreaming} />
                      ))}
                  </div>
                ) : entry.content ? (
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
                    {entry.roleLabel != null && <span className={styles.eventRole}>{entry.roleLabel}</span>}
                    {entry.note && <span className={styles.meta}>{entry.note}</span>}
                  </div>
                  {(entry.status || onOpenExecution) && (
                    <OpcStatus
                      {...(entry.status ?? {})}
                      action={onOpenExecution && {
                        member: entry.name,
                        onClick: () => onOpenExecution(entry.target),
                      }}
                    />
                  )}
                </div>
                {(!!entry.contents?.length || entry.content) && (
                  <div className={styles.reportBody}>
                    {entry.contents?.map((block) => (
                      <StreamingMarkdownRenderer
                        key={block.id}
                        content={block.content}
                        isStreaming={block.isStreaming}
                      />
                    ))}
                    {entry.content && <StreamingMarkdownRenderer content={entry.content} />}
                  </div>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
      {timelineFooter != null && (
        <li className={styles.event} data-kind="footer">
          <span className={styles.eventIcon} aria-hidden="true">
            <InfoCircleOutlined />
          </span>
          <div className={styles.eventBody}>{timelineFooter}</div>
        </li>
      )}
    </ol>
  );
}
