import { memo, type ReactNode } from 'react';
import { MarkdownCodeBlock } from '../markdown/MarkdownCodeBlock';
import type { MessageReferenceAnchor } from '../markdown/referenceAnchors';
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
  refAnchors?: MessageReferenceAnchor[];
  renderReference?: (anchor: MessageReferenceAnchor) => ReactNode;
  onCopy?: (text: string) => void | Promise<void>;
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

function formatToolPayload(value: unknown): { language: string; code: string } {
  if (typeof value === 'string') return { language: 'plaintext', code: value };
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized !== undefined) return { language: 'json', code: serialized };
  } catch {
    // 含循环引用等不可序列化对象时回退为纯文本。
  }
  return { language: 'plaintext', code: String(value) };
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
          refAnchors={props.refAnchors}
          renderReference={props.renderReference}
          onCopy={props.onCopy}
        />
      );
    case 'TOOL_CALL': {
      if (!item.tool_call_name) return null;
      const rawState = item.state?.trim();
      const failedStatus = !isStreaming && rawState && rawState !== 'success' ? rawState : undefined;
      const mcp = /^mcp__(.+?)__(.+)$/.exec(item.tool_call_name);
      const label = failedStatus
        ? `${item.tool_call_name} · ${failedStatus}`
        : mcp ? `${isStreaming ? '正在调用 MCP' : '调用 MCP 完成'} : ${mcp[1]} - ${mcp[2]}` : item.tool_call_name;
      const streamedCommand = item.delta?.command;
      const command = item.input === undefined && /^bash$/i.test(item.tool_call_name) &&
        typeof streamedCommand === 'string' && streamedCommand.length ? streamedCommand : undefined;
      const filePath = item.delta?.file_path;
      const detail = typeof filePath === 'string' ? filePath.split(/[/\\]/).pop() : undefined;
      const payloads = ([
        ['input', '参数', command ?? item.input, true],
        ['output', '输出', item.output, false],
      ] as const).flatMap(([key, title, value, defaultExpanded]) => {
        if (value === undefined) return [];
        const payloadKey = `${collapseKey}_${key}`;
        const formatted = key === 'input' && command
          ? { language: 'shell', code: command } : formatToolPayload(value);
        const expanded = contentExpandedMap?.[payloadKey]
          ?? (contentExpandedMap && onContentExpandedChange ? defaultExpanded : undefined);
        return [(
          <MarkdownCodeBlock
            key={payloadKey}
            collapseKey={payloadKey}
            title={title}
            language={formatted.language}
            code={formatted.code}
            defaultExpanded={defaultExpanded}
            expanded={expanded}
            onExpandedChange={onContentExpandedChange
              ? (nextExpanded) => onContentExpandedChange(payloadKey, nextExpanded)
              : undefined}
            onCopy={props.onCopy}
          />
        )];
      });
      return (
        <ToolCallMsg label={label} detail={detail} status={rawState} isStreaming={isStreaming}>
          {payloads.length > 0 ? payloads : undefined}
        </ToolCallMsg>
      );
    }
    case 'TOOL_RESPONSE':
      return item.tool_result_name === 'Bash' && typeof item.output === 'string'
        ? <ToolCallResponse {...expansion} content={item.output} onCopy={props.onCopy} /> : null;
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
