import { useState, type ReactNode } from 'react';
import { Collapse } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { MessageAppearanceProps } from './types';
import styles from './message.module.less';

export interface MessageCollapseProps extends MessageAppearanceProps {
  title: ReactNode;
  children?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  ghost?: boolean;
  destroyInactivePanel?: boolean;
  arrowPlacement?: 'start' | 'end' | 'inline' | 'none';
  extra?: ReactNode;
}

export function MessageCollapse({
  title, children, expanded, defaultExpanded = false, onExpandedChange,
  ghost = true, destroyInactivePanel, arrowPlacement = 'start', extra, className, style,
}: MessageCollapseProps) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? localExpanded;
  return (
    <div
      className={`${styles.collapse} ${className ?? ''}`}
      style={style}
      data-expanded={isExpanded}
      onClick={(event) => {
        // 折叠标题可能位于业务的复选框行内。
        if ((event.target as HTMLElement).closest(':is([class$="-collapse-header"], [class*="-collapse-header "])')) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
    >
      <Collapse
        ghost={ghost}
        destroyInactivePanel={destroyInactivePanel}
        expandIconPosition={arrowPlacement === 'end' ? 'end' : 'start'}
        activeKey={isExpanded ? ['content'] : []}
        onChange={(keys) => {
          const nextExpanded = (Array.isArray(keys) ? keys : [keys]).includes('content');
          setLocalExpanded(nextExpanded);
          onExpandedChange?.(nextExpanded);
        }}
      >
        <Collapse.Panel
          header={arrowPlacement === 'inline' ? <span>{title}<RightOutlined className={styles.inlineArrow} rotate={isExpanded ? 90 : 0} aria-hidden="true" /></span> : title}
          showArrow={arrowPlacement !== 'inline' && arrowPlacement !== 'none'} extra={extra} key="content"
        >{children}</Collapse.Panel>
      </Collapse>
    </div>
  );
}
