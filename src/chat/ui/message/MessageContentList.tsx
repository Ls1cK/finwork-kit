import { Fragment, memo, type ReactNode } from 'react';
import { TaskCompletedSplit } from './Content';
import { MessageContentItem, type MessageContentItemProps } from './MessageContentItem';
import { getContentKey, type MessageContent } from './types';

export interface MessageContentListProps<T extends MessageContent = MessageContent> extends Omit<
  MessageContentItemProps<T>, 'item' | 'isStreaming' | 'isAnswerStreaming' | 'isLatestContextCompress'
> {
  list: readonly T[];
  streamingAssistantContentId?: string;
  getItemKey?: (item: T) => string;
  /** 包裹或替换任意一项，完成拆分后的过程和结论同样经过此入口。 */
  renderItem?: (props: MessageContentItemProps<T>, defaultContent: ReactNode) => ReactNode;
  /** 由业务决定何时拆分。其余条目保留原顺序进入过程面板。 */
  conclusionId?: string;
  processTitle?: ReactNode;
  processExpanded?: boolean;
  defaultProcessExpanded?: boolean;
  onProcessExpandedChange?: (expanded: boolean) => void;
}

function MessageContentListInner<T extends MessageContent>({
  list, streamingAssistantContentId, getItemKey = getContentKey, renderItem,
  conclusionId, processTitle = '执行过程', processExpanded, defaultProcessExpanded,
  onProcessExpandedChange, ...contentProps
}: MessageContentListProps<T>) {
  const latestCompressIndex = list.map((item) => item.type).lastIndexOf('CONTEXT_COMPRESS');
  const conclusionIndex = conclusionId === undefined ? -1
    : list.findIndex((item) => (item.msg_content_id || item.id) === conclusionId);
  const render = (item: T, index: number) => {
    const props: MessageContentItemProps<T> = {
      ...contentProps, item,
      isStreaming: !!streamingAssistantContentId && streamingAssistantContentId === (item.msg_content_id || item.id),
      isAnswerStreaming: !!streamingAssistantContentId,
      isLatestContextCompress: index === latestCompressIndex,
    };
    const content = <MessageContentItem {...props} />;
    return renderItem ? renderItem(props, content) : content;
  };
  const nodes = list.map((item, index) => <Fragment key={getItemKey(item)}>{render(item, index)}</Fragment>);
  if (conclusionIndex < 0) return <>{nodes}</>;
  return (
    <TaskCompletedSplit
      title={processTitle} expanded={processExpanded} defaultExpanded={defaultProcessExpanded}
      onExpandedChange={onProcessExpandedChange}
      process={nodes.filter((_, index) => index !== conclusionIndex)}
      conclusion={nodes[conclusionIndex]}
    />
  );
}

export const MessageContentList = memo(MessageContentListInner) as typeof MessageContentListInner;
