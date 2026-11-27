import { memo, type ReactNode } from 'react';
import { CopyOutlined, RightOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { copyToClipboard } from '../markdown/MarkdownCodeBlock';
import motionStyles from '../runningShine.module.less';
import { MessageCollapse } from './MessageCollapse';
import type { MessageAppearanceProps } from './types';
import styles from './toolExecutionCard.module.less';

export interface ToolExecutionDetail {
  label: string;
  value: unknown;
}

export interface ToolExecutionCardProps extends MessageAppearanceProps {
  icon: ReactNode;
  label: ReactNode;
  preview?: string;
  isRunning?: boolean;
  failed?: boolean;
  details: readonly ToolExecutionDetail[];
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onCopy?: (text: string) => void | Promise<void>;
}

export function formatToolDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized !== undefined) return serialized;
  } catch {
    // 含循环引用等不可序列化对象时回退为字符串。
  }
  return String(value);
}

export const ToolExecutionCard = memo(function ToolExecutionCard({
  icon,
  label,
  preview,
  isRunning = false,
  failed = false,
  details,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onCopy,
  className,
  style,
}: ToolExecutionCardProps) {
  const available = details.filter(({ value }) => value != null && value !== '');
  const firstLine = preview?.trimStart().slice(0, 121).split(/\r?\n/, 1)[0];
  const previewText =
    firstLine && (firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine);
  const titleNode = previewText
    ? typeof label === 'string' || typeof label === 'number'
      ? `${label} ${previewText}`
      : [
          <span key="label">{label}</span>,
          ' ',
          <span key="preview">{previewText}</span>,
        ]
    : label;

  const handleCopy = async (content: string) => {
    try {
      if (onCopy) {
        await onCopy(content);
        return;
      }
      if (await copyToClipboard(content)) message.success('已复制');
      else message.error('复制失败');
    } catch {
      message.error('复制失败');
    }
  };

  const panelHeader = (
    <span className={styles.header}>
      {icon}
      <span
        className={[styles.label, isRunning ? motionStyles.thinkShine : ''].filter(Boolean).join(' ')}
        aria-live="polite"
      >
        {titleNode}
      </span>
      <RightOutlined className={styles.chevron} aria-hidden="true" />
    </span>
  );

  return (
    <div
      className={[styles.card, className].filter(Boolean).join(' ')}
      style={style}
      data-failed={failed || undefined}
    >
      <MessageCollapse
        className={styles.collapse}
        title={panelHeader}
        expanded={expanded}
        defaultExpanded={defaultExpanded}
        onExpandedChange={onExpandedChange}
        destroyInactivePanel
        ghost
        arrowPlacement="none"
      >
        <div className={styles.details}>
          {available.length > 0 ? (
            available.map(({ label: detailLabel, value }) => {
              const content = formatToolDetail(value) ?? '';
              return (
                <div key={detailLabel} className={styles.detail}>
                  <div className={styles.detailHeader}>
                    <span className={styles.detailLabel}>{detailLabel}</span>
                    <button
                      type="button"
                      aria-label={`复制${detailLabel}`}
                      className={styles.copyButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        void handleCopy(content);
                      }}
                    >
                      <CopyOutlined aria-hidden="true" />
                    </button>
                  </div>
                  <pre tabIndex={0} aria-label={detailLabel}>
                    {content}
                  </pre>
                </div>
              );
            })
          ) : (
            <div
              className={`${styles.detail} ${styles.emptyDetail}`}
              role="status"
              aria-label="暂无详情"
            >
              /
            </div>
          )}
        </div>
      </MessageCollapse>
    </div>
  );
});
