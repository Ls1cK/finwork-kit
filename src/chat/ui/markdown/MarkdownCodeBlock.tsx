import { memo, type ReactNode, type CSSProperties } from 'react';
import { Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { MessageCollapse } from '../message/MessageCollapse';
import CodeViewer from './CodeViewer';
import styles from './markdown.module.less';

export interface MarkdownCodeBlockProps {
  code: string;
  language: string;
  title?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  style?: CSSProperties;
  renderContent?: (code: string) => ReactNode;
  expanded?: boolean;
  collapseKey?: string;
  onExpandedChange?: (expanded: boolean) => void;
  onCopy?: (text: string) => void | Promise<void>;
}

/** 调用方可以注入复制动作，缺省时使用浏览器剪贴板及兼容回退。 */
export const MarkdownCodeBlock = memo(function MarkdownCodeBlock({
  code, language, title = language, expanded, defaultExpanded = true,
  className, style, renderContent, collapseKey = 'code', onExpandedChange, onCopy,
}: MarkdownCodeBlockProps) {
  const copy = async () => {
    try {
      if (onCopy) {
        await onCopy(code);
        return;
      }
      if (await copyToClipboard(code)) message.success('已复制');
      else message.error('复制失败');
    } catch {
      message.error('复制失败');
    }
  };
  return (
    <MessageCollapse
      key={collapseKey}
      className={`${styles.codeCollapse} ${className ?? ''}`}
      style={style}
      ghost={false}
      arrowPlacement="end"
      expanded={expanded}
      defaultExpanded={defaultExpanded}
      onExpandedChange={onExpandedChange}
      title={title}
      extra={
          <Button
            type="text" size="small" aria-label="复制代码" icon={<CopyOutlined />}
            className={styles.copyIcon}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              void copy();
            }}
          />
      }
    >
      {renderContent ? renderContent(code) : <CodeViewer language={language} content={code} />}
    </MessageCollapse>
  );
});

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 安全上下文或权限不足时继续尝试兼容路径。
    }
  }
  const textarea = document.createElement('textarea');
  try {
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export default MarkdownCodeBlock;
