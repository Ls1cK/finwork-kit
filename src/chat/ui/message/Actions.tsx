import { memo, type ReactNode } from 'react';
import { ArrowRightOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, MessageOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type { MessageAppearanceProps } from './types';
import styles from './message.module.less';

export interface MessageAction {
  key: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface MessageActionsProps extends MessageAppearanceProps {
  actions: readonly MessageAction[];
  children?: ReactNode;
}

export const MessageActions = memo(function MessageActions({ actions, children, className, style }: MessageActionsProps) {
  return (
    <div className={`${styles.actions} ${className ?? ''}`} style={style}>
      {actions.map((action) => (
        <Tooltip key={action.key} title={action.label}>
          <Button
            type="text" size="small" aria-label={action.label}
            className={action.active ? styles.activeAction : undefined}
            aria-pressed={action.active} icon={action.icon}
            loading={action.loading} disabled={action.disabled}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              action.onClick();
            }}
          >
            {action.icon ? undefined : action.label}
          </Button>
        </Tooltip>
      ))}
      {children}
    </div>
  );
});

export interface SuggestedQuestionsProps extends MessageAppearanceProps {
  questions: readonly string[];
  title?: ReactNode;
  disabled?: boolean;
  onSelect: (question: string) => void;
}

export const SuggestedQuestions = memo(function SuggestedQuestions({
  questions, title = '推荐追问', disabled = false, onSelect, className, style,
}: SuggestedQuestionsProps) {
  if (questions.length === 0) return null;
  return (
    <div className={`${styles.suggestions} ${className ?? ''}`} style={style}>
      <div className={styles.suggestionTitle}>{title}</div>
      {questions.map((text, index) => (
        <Button key={`${text}_${index}`} className={styles.suggestion} disabled={disabled} onClick={(event) => { event.stopPropagation(); onSelect(text); }}>
          <MessageOutlined /><span>{text}</span><ArrowRightOutlined />
        </Button>
      ))}
    </div>
  );
});

export interface ChatCompletedResultProps extends MessageAppearanceProps {
  status?: 'success' | 'error' | 'timeout' | 'uncompleted';
  message?: ReactNode;
  actions?: ReactNode;
  usage?: readonly ReactNode[];
  children?: ReactNode;
}

export const ChatCompletedResult = memo(function ChatCompletedResult({
  status, message, actions, usage = [], children, className, style,
}: ChatCompletedResultProps) {
  const icons = { success: <CheckCircleOutlined />, error: <CloseCircleOutlined />, timeout: <ClockCircleOutlined />, uncompleted: <ClockCircleOutlined /> };
  return (
    <div className={`${styles.completedResult} ${className ?? ''}`} style={style}>
      <div className={styles.completedRow}>
        {(status || message) && <span className={status ? styles[status] : undefined}>{status && icons[status]} {message}</span>}
        {actions}
      </div>
      {usage.length > 0 && <div className={styles.usage}>{usage.map((label, index) => <span key={index}>{label}</span>)}</div>}
      {children}
    </div>
  );
});
