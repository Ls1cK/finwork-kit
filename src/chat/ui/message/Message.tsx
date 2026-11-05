import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyOutlined, DownOutlined, LoadingOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Result, Tag } from 'antd';
import type { MessageAppearanceProps } from './types';
import styles from './message.module.less';

export interface UserMessageProps extends MessageAppearanceProps {
  content?: ReactNode;
  skillName?: string;
  files?: ReactNode;
  extra?: ReactNode;
  metadata?: ReactNode;
  onCopy?: () => void;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export const UserMessage = memo(function UserMessage({
  content, skillName, files, extra, metadata, onCopy, expanded, defaultExpanded = false,
  onExpandedChange, className, style,
}: UserMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const [overflow, setOverflow] = useState(false);
  const isExpanded = expanded ?? localExpanded;
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const update = () => setOverflow(element.scrollHeight > 320);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content, skillName]);
  return (
    <div className={`${styles.userMessage} ${className ?? ''}`} style={style}>
      {files}
      {extra}
      {content !== undefined && content !== null && (
        <div className={`${styles.userBubble} ${overflow && !isExpanded ? styles.userBubbleCollapsed : ''} ${overflow ? styles.userBubbleExpandable : ''}`}>
          {skillName && <Tag className={styles.skillName}>@{skillName}</Tag>}
          <div ref={contentRef}>{content === '' ? ' ' : content}</div>
          {overflow && !isExpanded && <div className={styles.gradientMask} />}
          {overflow && (
            <Button
              type="text" className={styles.expandButton} aria-expanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                setLocalExpanded(!isExpanded);
                onExpandedChange?.(!isExpanded);
              }}
            >
              {isExpanded ? '收起' : '展开更多'} {isExpanded ? <UpOutlined /> : <DownOutlined />}
            </Button>
          )}
        </div>
      )}
      <div className={styles.metadata}>
        {metadata}
        {onCopy && <Button type="text" size="small" aria-label="复制消息" icon={<CopyOutlined />} onClick={(event) => { event.stopPropagation(); onCopy(); }} />}
      </div>
    </div>
  );
});

export interface AiMessageProps extends MessageAppearanceProps {
  title?: ReactNode;
  avatar?: ReactNode;
  connecting?: boolean;
  processing?: boolean;
  processingIndicator?: ReactNode;
  error?: ReactNode;
  children?: ReactNode;
  output?: ReactNode;
  footer?: ReactNode;
  suggestions?: ReactNode;
}

export const AiMessage = memo(function AiMessage({
  title = 'FinWork', avatar, connecting = false, processing = false,
  processingIndicator = <LoadingOutlined aria-label="正在处理" />, error,
  children, output, footer, suggestions, className, style,
}: AiMessageProps) {
  return (
    <div className={`${styles.aiMessage} ${className ?? ''}`} style={style} aria-busy={connecting || processing}>
      <div className={styles.aiHeader}>{connecting ? <LoadingOutlined aria-label="正在连接" /> : avatar}<span>{title}</span></div>
      <div className={styles.aiContent}>
        {children}
        {output}
        {error ? <Result status="error" title="任务发生错误" subTitle={error} /> : (
          <>{processing ? processingIndicator : footer}{suggestions}</>
        )}
      </div>
    </div>
  );
});

export interface SystemMessageProps extends MessageAppearanceProps {
  children?: ReactNode;
}

export const SystemMessage = memo(function SystemMessage({ children, className, style }: SystemMessageProps) {
  return <div className={`${styles.systemMessage} ${className ?? ''}`} style={style}>{children}</div>;
});

export interface MessageItemProps extends MessageAppearanceProps {
  role: 'user' | 'assistant' | 'system';
  children?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}

/** 仅提供消息容器。角色对应的内容由调用方组合，避免隐藏的业务选择器。 */
export const MessageItem = memo(function MessageItem({ role, children, header, footer, className, style }: MessageItemProps) {
  return (
    <article className={`${styles.messageItem} ${className ?? ''}`} style={style} data-message-role={role}>
      {header}{children}{footer}
    </article>
  );
});
