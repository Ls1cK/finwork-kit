import { memo, useState } from 'react';
import { Button, Popover } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { MessageReferenceAnchor } from './referenceAnchors';
import styles from './reference.module.less';

export interface ReferenceDisplayItem {
  title?: string;
  content?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
}

export interface ReferenceAnchorProps {
  anchor: MessageReferenceAnchor;
  title: string;
  contents: readonly ReferenceDisplayItem[];
}

/** 引用字段的业务映射由宿主完成，组件只负责来源卡片和分页展示。 */
export const ReferenceAnchor = memo(function ReferenceAnchor({ anchor, title, contents }: ReferenceAnchorProps) {
  const [contentIndex, setContentIndex] = useState(0);
  const index = Math.min(contentIndex, Math.max(0, contents.length - 1));
  const current = contents[index];
  const changePage = (delta: number) => setContentIndex((index + delta + contents.length) % contents.length);
  const url = current?.url?.trim().toLowerCase().startsWith('javascript:') ? undefined : current?.url;
  const card = (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleArea}>
          <span className={styles.mainTitle}>{title}</span>
          {contents.length > 1 && (
            <span className={styles.pager}>
              <Button type="text" size="small" className={styles.navButton} aria-label="上一条来源" icon={<LeftOutlined />} onClick={(event) => { event.stopPropagation(); changePage(-1); }} />
              <span className={styles.navIndex}>{index + 1}/{contents.length}</span>
              <Button type="text" size="small" className={styles.navButton} aria-label="下一条来源" icon={<RightOutlined />} onClick={(event) => { event.stopPropagation(); changePage(1); }} />
            </span>
          )}
        </div>
      </div>
      <div className={styles.cardBody}>
        {current?.title && <div className={styles.subTitle}>{current.title}</div>}
        {(current?.source || current?.publishedAt) && (
          <div className={styles.metaRow}>
            {current.source && <span className={styles.metaTag}>{current.source}</span>}
            {current.publishedAt && <span className={styles.metaTag}>{current.publishedAt}</span>}
          </div>
        )}
        {current?.content && <div className={styles.body}>{current.content}</div>}
      </div>
      {url && <div className={styles.footer}><Button type="link" size="small" href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>查看原文</Button></div>}
    </div>
  );
  return (
    <Popover content={card} trigger={['hover', 'focus']} placement="bottomLeft" overlayClassName={styles.popover} mouseEnterDelay={0} mouseLeaveDelay={0.15}>
      <button type="button" className={styles.anchor} onClick={(event) => event.preventDefault()} aria-label={`来源 ${anchor.idx}`}>[{anchor.idx}]</button>
    </Popover>
  );
});
