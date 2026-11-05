import { memo, type ReactNode } from 'react';
import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { Divider, Input, Radio } from 'antd';
import { MessageCollapse, type MessageCollapseProps } from './MessageCollapse';
import type { MessageAppearanceProps, MessageTextRenderer } from './types';
import styles from './message.module.less';
import { StreamingMarkdownRenderer, StreamingTextRenderer, type StreamingMarkdownRendererProps } from '../markdown/StreamingMarkdownRenderer';
import { MarkdownCodeBlock } from '../markdown/MarkdownCodeBlock';

export interface AssistantContentProps extends MessageAppearanceProps, StreamingMarkdownRendererProps {
  renderContent?: MessageTextRenderer;
}

export const AssistantContent = memo(function AssistantContent({
  content, isStreaming = false, renderContent, className, style,
  refAnchors, renderReference, onCopy, overrides,
}: AssistantContentProps) {
  if (!content.trim()) return null;
  return (
    <div className={`${styles.assistantContent} ${className ?? ''}`} style={style} aria-busy={isStreaming}>
      {renderContent ? renderContent(content.trim(), isStreaming) : (
        <StreamingMarkdownRenderer
          content={content.trim()} isStreaming={isStreaming} refAnchors={refAnchors}
          renderReference={renderReference} onCopy={onCopy} overrides={overrides}
        />
      )}
    </div>
  );
});

export interface ThinkContentProps extends MessageAppearanceProps {
  content: string;
  isStreaming?: boolean;
  renderContent?: MessageTextRenderer;
  title?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export const ThinkContent = memo(function ThinkContent({
  content, isStreaming = false, title, renderContent, ...collapseProps
}: ThinkContentProps) {
  return (
    <MessageCollapse {...collapseProps} className={`${styles.thinkCollapse} ${collapseProps.className ?? ''}`} arrowPlacement="inline" title={title ?? (isStreaming ? '正在思考中...' : '已完成思考')}>
      <div className={`${styles.thinkContent} ${renderContent ? '' : styles.plainText}`} aria-busy={isStreaming}>
        {renderContent ? renderContent(content, isStreaming) : <StreamingTextRenderer content={content} isStreaming={isStreaming} />}
      </div>
    </MessageCollapse>
  );
});

export interface ToolCallMsgProps extends MessageAppearanceProps {
  label: ReactNode;
  detail?: ReactNode;
  isStreaming?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const ToolCallMsg = memo(function ToolCallMsg({
  label, detail, isStreaming = false, icon, children, className, style,
}: ToolCallMsgProps) {
  return (
    <div className={`${styles.toolCall} ${className ?? ''}`} style={style}>
      <div className={styles.toolCallCard} aria-busy={isStreaming}>
        {icon ?? (isStreaming ? <LoadingOutlined /> : <CheckCircleOutlined />)}
        <span>{label}</span>
        {detail && <span className={styles.truncate}>{detail}</span>}
      </div>
      {children}
    </div>
  );
});

export interface ToolCallResponseProps extends MessageAppearanceProps {
  content: string;
  title?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  renderContent?: (content: string) => ReactNode;
  onCopy?: (text: string) => void | Promise<void>;
}

export const ToolCallResponse = memo(function ToolCallResponse({
  content, title = '执行结果', renderContent, onCopy, ...collapseProps
}: ToolCallResponseProps) {
  if (!content) return null;
  return (
    <MarkdownCodeBlock {...collapseProps} title={title} code={content} language="shell" defaultExpanded={collapseProps.defaultExpanded ?? false} renderContent={renderContent} onCopy={onCopy} />
  );
});

export type ContextCompressDisplayStatus = 'unfinished' | 'compressing' | 'success' | 'failed';

export interface ContextCompressContentProps extends MessageAppearanceProps {
  status: ContextCompressDisplayStatus;
  label?: ReactNode;
  icon?: ReactNode;
}

const compressLabels: Record<ContextCompressDisplayStatus, string> = {
  unfinished: '上下文压缩未完成', compressing: '上下文正在压缩中',
  success: '上下文压缩成功', failed: '上下文压缩失败',
};

export const ContextCompressContent = memo(function ContextCompressContent({
  status, label, icon, className, style,
}: ContextCompressContentProps) {
  const icons = {
    unfinished: <ExclamationCircleOutlined />, compressing: <LoadingOutlined />,
    success: <CheckCircleOutlined />, failed: <CloseCircleOutlined />,
  };
  return (
    <Divider plain className={`${styles.contextCompress} ${className ?? ''}`} style={style}>
      <span className={`${styles.compressStatus} ${styles[status]}`} role="status">{icon ?? icons[status]}<span>{label ?? compressLabels[status]}</span></span>
    </Divider>
  );
});

export interface AskUserQuestionContentProps extends MessageAppearanceProps {
  question: string;
  options?: readonly { id: string; text: string }[];
  answer?: { optionId?: string; userMessage?: string };
}

export const AskUserQuestionContent = memo(function AskUserQuestionContent({
  question, options = [], answer, className, style,
}: AskUserQuestionContentProps) {
  const userMessage = answer?.userMessage?.trim();
  if (!answer?.optionId && !userMessage) return null;
  return (
    <section className={`${styles.questionPreview} ${className ?? ''}`} style={style} aria-label={question}>
      <div className={styles.questionTitle}>{question}</div>
      <div className={styles.questionOptions}>
        {options.map((option) => (
          <Radio key={option.id} checked={answer?.optionId === option.id} disabled>{option.text}</Radio>
        ))}
      </div>
      {userMessage && <div className={styles.questionAnswer}><Input value={userMessage} disabled aria-label="补充回答" /></div>}
    </section>
  );
});

export interface TaskCompletedSplitProps extends Omit<MessageCollapseProps, 'title' | 'children'> {
  process: ReactNode;
  conclusion: ReactNode;
  title: ReactNode;
}

export function TaskCompletedSplit({ process, conclusion, title, ...props }: TaskCompletedSplitProps) {
  return (
    <>
      <MessageCollapse {...props} className={`${styles.taskCompletedCollapse} ${props.className ?? ''}`} arrowPlacement="inline" title={title}>{process}</MessageCollapse>
      {conclusion}
    </>
  );
}
