import { memo, useMemo, type ReactNode } from 'react';
import type { MarkdownToJSX } from 'markdown-to-jsx';
import MarkdownViewer from './MarkdownViewer';
import { preprocessStreamingExtra } from './preprocess';
import { useSmoothStream } from './useSmoothStream';
import { replaceRefAnchorsWithIdx, type MessageReferenceAnchor } from './referenceAnchors';
import styles from './markdown.module.less';

export interface StreamingMarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  refAnchors?: MessageReferenceAnchor[];
  renderReference?: (anchor: MessageReferenceAnchor) => ReactNode;
  onCopy?: (text: string) => void | Promise<void>;
  overrides?: MarkdownToJSX.Options['overrides'];
}

const STRONG_MARKDOWN_RE =
  /(```|^\s*#{1,6}\s|\*\*[^*]+\*\*|^\s*[-*+]\s|^\s*\d+\.\s|\[.*\]\(.*\)|^\s*>\s)/m;

export const StreamingMarkdownRenderer = memo(function StreamingMarkdownRenderer({
  content, isStreaming = false, refAnchors, renderReference, onCopy, overrides,
}: StreamingMarkdownRendererProps) {
  const displayed = useSmoothStream(content, isStreaming);
  const markdown = !isStreaming || STRONG_MARKDOWN_RE.test(content);
  const displayContent = useMemo(
    () => refAnchors ? replaceRefAnchorsWithIdx(displayed, refAnchors) : displayed,
    [displayed, refAnchors],
  );
  const mergedOverrides = useMemo<MarkdownToJSX.Options['overrides']>(() => ({
    ...(renderReference ? {
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href?.startsWith('#ref:') && !Number.isNaN(Number(children))) {
          return renderReference({ referenceId: href.slice(5), idx: Number(children) });
        }
        const safeHref = href?.trim().toLowerCase().startsWith('javascript:') ? '#' : href;
        const anchor = safeHref?.startsWith('#');
        return (
          <a href={safeHref} target={anchor ? undefined : '_blank'} rel={anchor ? undefined : 'noopener noreferrer'}>
            {children}
          </a>
        );
      },
    } : {}),
    ...overrides,
  }), [renderReference, overrides]);

  if (!markdown) {
    return <div className={`${styles.md} ${styles.plainText}`}>{displayed}<span className={styles.cursor}>|</span></div>;
  }
  return (
    <MarkdownViewer
      content={displayContent} showImage={false}
      extraPreprocess={preprocessStreamingExtra} overrides={mergedOverrides} onCopy={onCopy}
    />
  );
});

export interface StreamingTextRendererProps {
  content: string;
  isStreaming?: boolean;
}

export const StreamingTextRenderer = memo(function StreamingTextRenderer({ content, isStreaming = false }: StreamingTextRendererProps) {
  const displayed = useSmoothStream(content, isStreaming);
  return (
    <span className={styles.plainText}>
      {displayed}{isStreaming && <span className={styles.cursor}>|</span>}
    </span>
  );
});
