import { memo, type ReactNode } from 'react';
import {
  AssistantContent, AskUserQuestionContent, ContextCompressContent,
  ThinkContent, ToolCallMsg, ToolCallResponse,
} from './Content';
import { MultiSubAgentCard } from './SubAgent';
import {
  getContentCollapseKey, type MessageContent, type MessageContentExpandedProps,
  type MessageTextRenderer, type SubAgent,
} from './types';

export interface MessageContentItemRenderProps<T extends MessageContent = MessageContent> extends MessageContentExpandedProps {
  item: T;
  isStreaming?: boolean;
  isAnswerStreaming?: boolean;
  isLatestContextCompress?: boolean;
  renderMarkdown?: MessageTextRenderer;
  renderContent?: MessageTextRenderer;
  renderText?: MessageTextRenderer;
  onSubAgentSelect?: (subagent: SubAgent, item: T) => void;
}

export type MessageContentRenderers<T extends MessageContent = MessageContent> = Readonly<
  Partial<Record<string, (props: MessageContentItemRenderProps<T>) => ReactNode>>
>;

export interface MessageContentItemProps<T extends MessageContent = MessageContent> extends MessageContentItemRenderProps<T> {
  /** 同名覆盖内置类型，新增键支持业务自己的内容类型，返回 null 可隐藏该类型。 */
  renderers?: MessageContentRenderers<T>;
  renderUnknown?: (props: MessageContentItemRenderProps<T>) => ReactNode;
}

function MessageContentItemInner<T extends MessageContent>({
  renderers, renderUnknown, ...props
}: MessageContentItemProps<T>): ReactNode {
  const { item, isStreaming = false, contentExpandedMap, onContentExpandedChange } = props;
  const renderer = renderers && Object.prototype.hasOwnProperty.call(renderers, item.type)
    ? renderers[item.type] : undefined;
  if (renderer) return renderer(props);

  const collapseKey = getContentCollapseKey(item);
  const expansion = {
    expanded: contentExpandedMap?.[collapseKey],
    onExpandedChange: (expanded: boolean) => onContentExpandedChange?.(collapseKey, expanded),
  };

  switch (item.type) {
    case 'THINK_MSG':
      return (
        <ThinkContent
          {...expansion}
          content={item.content ?? ''}
          isStreaming={isStreaming}
          renderContent={props.renderText}
        />
      );
    case 'ASSISTANT_MSG':
      return (
        <AssistantContent
          content={item.content ?? ''}
          isStreaming={isStreaming}
          renderContent={props.renderContent ?? props.renderMarkdown}
        />
      );
    case 'TOOL_CALL':
      return item.tool_call_name
        ? <ToolCallMsg label={item.tool_call_name} isStreaming={isStreaming} />
        : null;
    case 'TOOL_RESPONSE':
      return item.tool_result_name === 'Bash'
        ? <ToolCallResponse {...expansion} content={item.output ?? ''} /> : null;
    case 'SUBAGENTS':
      return (
        <MultiSubAgentCard
          {...expansion}
          subagents={item.subAgentRenderConfig?.subAgentList ?? []}
          onSelect={props.onSubAgentSelect
            ? (agent) => props.onSubAgentSelect?.(agent, item)
            : undefined}
        />
      );
    case 'CONTEXT_COMPRESS':
      return (
        <ContextCompressContent
          status={item.contextCompressStatus === 'success' || item.contextCompressStatus === 'failed'
            ? item.contextCompressStatus
            : props.isAnswerStreaming && props.isLatestContextCompress ? 'compressing' : 'unfinished'}
        />
      );
    case 'ASK_USER_QUESTION':
      return (
        <AskUserQuestionContent
          question={item.question || '用户提问回答'}
          options={item.options}
          answer={item.userAnswer}
        />
      );
    default:
      return renderUnknown?.(props) ?? null;
  }
}

export const MessageContentItem = memo(MessageContentItemInner) as typeof MessageContentItemInner;
