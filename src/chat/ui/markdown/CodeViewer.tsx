import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import './highlight.less';

import styles from './code.module.less';
import { escapeHtml, highlightCodeSnippet } from './highlight';

const LINE_HIGHLIGHT_CACHE_LIMIT = 4000;
const BLOCK_HIGHLIGHT_SETTLE_DELAY = 180;
const BLOCK_HIGHLIGHT_MAX_LENGTH = 200_000;
const MAX_HIGHLIGHT_LINE_LENGTH = 20000;
const HIGHLIGHT_CHUNK_SIZE = 12;
const MAX_HIGHLIGHT_STARTS_PER_TICK = 2;
const HIGHLIGHT_QUEUE_COMPACT_THRESHOLD = 200;
/** 增量高亮的节流间隔：流式输出期间，内容稳定此毫秒数后才开始调度异步高亮 */
const HIGHLIGHT_THROTTLE_MS = 150;
const lineHighlightCache = new Map<string, string>();

export interface CodeViewerProps {
  // --- 独立使用时的 API ---
  content?: string;
  language?: string;

  // --- markdown-to-jsx 自动注入的 API ---
  children?: string;
  className?: string;
}

interface LineHighlightCacheEntry {
  highlighted: boolean;
  html: string;
  language: string;
  text: string;
}

interface HighlightState {
  key: string;
  lineHtmlList: string[];
}

interface IdleScheduler {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

interface HighlightQueueItem {
  callback: () => void;
  cancelled: boolean;
}

const highlightQueue: HighlightQueueItem[] = [];
let highlightPumpCancel: (() => void) | null = null;

function CodeViewer({ content, language, children, className }: CodeViewerProps) {
  const codeRef = useRef<HTMLPreElement>(null);
  const lineCacheRef = useRef<Map<number, LineHighlightCacheEntry>>(new Map());
  const highlightVersionRef = useRef(0);
  const highlightThrottleRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [highlightState, setHighlightState] = useState<HighlightState>({
    key: '',
    lineHtmlList: [],
  });

  // 抹平传参差异：优先使用显式传入的 content/language，其次使用 markdown-to-jsx 注入的值
  const actualContent = content ?? children ?? '';
  const actualLanguage = language || (className ? className.replace('lang-', '') : 'plaintext');
  const highlightKey = `${actualLanguage}\u0000${actualContent}`;
  const codeLines = useMemo(() => actualContent.split('\n'), [actualContent]);
  const plainLineHtmlList = useMemo(() => {
    return codeLines.map((line) => escapeHtml(line));
  }, [codeLines]);
  const renderedLineHtmlList =
    highlightState.key === highlightKey ? highlightState.lineHtmlList : plainLineHtmlList;
  const renderedHtml = useMemo(() => {
    return buildCodeLinesHtml(renderedLineHtmlList);
  }, [renderedLineHtmlList]);

  // 流式内容通常只追加尾部行，这里按行复用旧高亮结果，避免每次 SSE 更新都重跑整块高亮。
  useEffect(() => {
    const version = highlightVersionRef.current + 1;
    highlightVersionRef.current = version;
    let cancelled = false;
    let settleHighlightHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
    const cancelScheduledHighlights: Array<() => void> = [];
    const nextLineCache = new Map<number, LineHighlightCacheEntry>();
    const linesToHighlight: Array<{ index: number; text: string }> = [];

    const nextLineHtmlList = codeLines.map((line, index) => {
      const previousEntry = lineCacheRef.current.get(index);
      if (
        previousEntry &&
        previousEntry.language === actualLanguage &&
        previousEntry.text === line
      ) {
        nextLineCache.set(index, previousEntry);

        if (!previousEntry.highlighted && shouldHighlightLine(line, actualLanguage)) {
          linesToHighlight.push({ index, text: line });
        }

        return previousEntry.html;
      }

      const cachedHtml = getLineHighlightCache(actualLanguage, line);
      if (cachedHtml !== undefined) {
        const cacheEntry = {
          highlighted: true,
          html: cachedHtml,
          language: actualLanguage,
          text: line,
        };
        nextLineCache.set(index, cacheEntry);
        return cachedHtml;
      }

      const fallbackHtml = escapeHtml(line);
      const fallbackEntry = {
        highlighted: !shouldHighlightLine(line, actualLanguage),
        html: fallbackHtml,
        language: actualLanguage,
        text: line,
      };
      nextLineCache.set(index, fallbackEntry);

      if (shouldHighlightLine(line, actualLanguage)) {
        linesToHighlight.push({ index, text: line });
      }

      return fallbackHtml;
    });

    lineCacheRef.current = nextLineCache;
    setHighlightState({ key: highlightKey, lineHtmlList: nextLineHtmlList });

    // 节流增量高亮调度：流式输出期间内容变化频繁，每次都调度高亮会导致
    // 活跃行在高亮态和纯文本态之间快速切换产生闪动。等待内容稳定后再批量调度。
    if (highlightThrottleRef.current !== null) {
      globalThis.clearTimeout(highlightThrottleRef.current);
    }

    highlightThrottleRef.current = globalThis.setTimeout(() => {
      highlightThrottleRef.current = null;
      if (cancelled || highlightVersionRef.current !== version) return;

      for (let start = 0; start < linesToHighlight.length; start += HIGHLIGHT_CHUNK_SIZE) {
        const chunk = linesToHighlight.slice(start, start + HIGHLIGHT_CHUNK_SIZE);
        const cancelSchedule = scheduleHighlight(() => {
          Promise.all(
            chunk.map(async ({ index, text }) => {
              try {
                const html = await highlightCodeSnippet(text, actualLanguage);
                return { html, index, text };
              } catch {
                return { html: escapeHtml(text), index, text };
              }
            }),
          ).then((highlightedLines) => {
            if (cancelled || highlightVersionRef.current !== version) return;

            setHighlightState((currentState) => {
              if (currentState.key !== highlightKey) return currentState;

              let hasChanges = false;
              const nextHtmlList = [...currentState.lineHtmlList];

              for (const { html, index, text } of highlightedLines) {
                const currentEntry = lineCacheRef.current.get(index);
                if (
                  !currentEntry ||
                  currentEntry.language !== actualLanguage ||
                  currentEntry.text !== text
                ) {
                  continue;
                }

                const nextHtml = html || escapeHtml(text);
                setLineHighlightCache(actualLanguage, text, nextHtml);
                lineCacheRef.current.set(index, {
                  highlighted: true,
                  html: nextHtml,
                  language: actualLanguage,
                  text,
                });

                if (nextHtmlList[index] !== nextHtml) {
                  nextHtmlList[index] = nextHtml;
                  hasChanges = true;
                }
              }

              return hasChanges ? { key: highlightKey, lineHtmlList: nextHtmlList } : currentState;
            });
          });
        });

        cancelScheduledHighlights.push(cancelSchedule);
      }
    }, HIGHLIGHT_THROTTLE_MS);

    if (shouldRunSettledBlockHighlight(actualContent, actualLanguage)) {
      settleHighlightHandle = globalThis.setTimeout(() => {
        highlightCodeSnippet(actualContent, actualLanguage)
          .then((highlightedCode) => {
            if (cancelled || highlightVersionRef.current !== version) return;

            const highlightedLineHtmlList = highlightedCode.split('\n');
            const nextSettledLineCache = new Map<number, LineHighlightCacheEntry>();

            codeLines.forEach((line, index) => {
              const html = highlightedLineHtmlList[index] ?? escapeHtml(line);
              nextSettledLineCache.set(index, {
                highlighted: true,
                html,
                language: actualLanguage,
                text: line,
              });
            });

            lineCacheRef.current = nextSettledLineCache;
            setHighlightState({ key: highlightKey, lineHtmlList: highlightedLineHtmlList });
          })
          .catch(() => {
            // 行级高亮已经提供了可用降级，整块收敛失败时保持当前渲染。
          });
      }, BLOCK_HIGHLIGHT_SETTLE_DELAY);
    }

    return () => {
      cancelled = true;
      if (highlightThrottleRef.current !== null) {
        globalThis.clearTimeout(highlightThrottleRef.current);
        highlightThrottleRef.current = null;
      }
      if (settleHighlightHandle !== undefined) {
        globalThis.clearTimeout(settleHighlightHandle);
      }
      cancelScheduledHighlights.forEach((cancelSchedule) => cancelSchedule());
    };
  }, [actualContent, actualLanguage, codeLines, highlightKey]);

  const deHighlightedHtml = useDeferredValue(renderedHtml);
  return (
    <div className={styles.container}>
      <div className={styles.codeWrapper}>
        <pre ref={codeRef} className={styles.codeBlock}>
          {/* 只注入经过转义的文本和高亮器生成的 HTML。 */}
          <code className={styles.code} dangerouslySetInnerHTML={{ __html: deHighlightedHtml }} />
        </pre>
      </div>
    </div>
  );
}

function scheduleHighlight(callback: () => void): () => void {
  const queueItem: HighlightQueueItem = {
    callback,
    cancelled: false,
  };

  highlightQueue.push(queueItem);
  scheduleHighlightPump();

  return () => {
    queueItem.cancelled = true;
    if (highlightQueue.length > HIGHLIGHT_QUEUE_COMPACT_THRESHOLD) {
      compactHighlightQueue();
    }
  };
}

function scheduleHighlightPump() {
  if (highlightPumpCancel) return;

  const idleWindow = window as unknown as IdleScheduler;

  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(runHighlightQueue, { timeout: 250 });
    highlightPumpCancel = () => idleWindow.cancelIdleCallback?.(handle);
    return;
  }

  const handle = globalThis.setTimeout(runHighlightQueue, 16);
  highlightPumpCancel = () => globalThis.clearTimeout(handle);
}

function runHighlightQueue() {
  highlightPumpCancel = null;
  compactHighlightQueue();

  let startedCount = 0;

  while (highlightQueue.length && startedCount < MAX_HIGHLIGHT_STARTS_PER_TICK) {
    const queueItem = highlightQueue.shift();
    if (!queueItem || queueItem.cancelled) continue;

    startedCount += 1;
    queueItem.callback();
  }

  compactHighlightQueue();

  if (highlightQueue.length) {
    scheduleHighlightPump();
  }
}

function compactHighlightQueue() {
  let writeIndex = 0;

  for (let readIndex = 0; readIndex < highlightQueue.length; readIndex += 1) {
    const queueItem = highlightQueue[readIndex];
    if (!queueItem.cancelled) {
      highlightQueue[writeIndex] = queueItem;
      writeIndex += 1;
    }
  }

  highlightQueue.length = writeIndex;
}

function getLineHighlightCache(language: string, line: string): string | undefined {
  return lineHighlightCache.get(getLineHighlightCacheKey(language, line));
}

function setLineHighlightCache(language: string, line: string, html: string) {
  lineHighlightCache.set(getLineHighlightCacheKey(language, line), html);

  if (lineHighlightCache.size <= LINE_HIGHLIGHT_CACHE_LIMIT) return;

  const firstKey = lineHighlightCache.keys().next().value;
  if (firstKey) {
    lineHighlightCache.delete(firstKey);
  }
}

function getLineHighlightCacheKey(language: string, line: string): string {
  return `${language}\u0000${line}`;
}

function shouldHighlightLine(line: string, language: string): boolean {
  return language !== 'plaintext' && line.length <= MAX_HIGHLIGHT_LINE_LENGTH;
}

function shouldRunSettledBlockHighlight(code: string, language: string): boolean {
  return Boolean(code) && language !== 'plaintext' && code.length <= BLOCK_HIGHLIGHT_MAX_LENGTH;
}

/**
 * 生成带行号的 HTML。普通文本占位和高亮结果复用同一结构，避免异步高亮导致块高度突变。
 */
function buildCodeLinesHtml(lineHtmlList: string[]): string {
  const lineCount = lineHtmlList.length;
  const lineNumberWidth = String(lineCount).length;

  return lineHtmlList
    .map((line, index) => {
      const lineNumber = String(index + 1).padStart(lineNumberWidth, ' ');
      // 这里的 DOM 结构是我们自己硬编码生成的，不存在注入风险
      return `<div class="${styles.line}">
        <div class="${styles.lineNumber}">${lineNumber}</div>
        <div class="${styles.lineContent}">${line || '&nbsp;'}</div>
      </div>`;
    })
    .join('');
}

export default memo(CodeViewer);
