import { memo, type ReactNode } from 'react';
import { ApiOutlined, CodeOutlined, FunctionOutlined, ToolOutlined } from '@ant-design/icons';
import { getCommandToolName } from '../../core-sse/commandTool';
import type { MessageReferenceAnchor } from '../markdown/referenceAnchors';
import {
  AssistantContent, AskUserQuestionContent, ContextCompressContent,
  ThinkContent,
} from './Content';
import { MultiSubAgentCard } from './SubAgent';
import {
  formatToolDetail, ToolExecutionCard, type ToolExecutionDetail,
} from './ToolExecutionCard';
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function renderCommandExecution<T extends MessageContent>({
  item,
  isPython,
  isRunning,
  expanded,
  onExpandedChange,
  onCopy,
}: {
  item: T;
  isPython: boolean;
  isRunning: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onCopy?: (text: string) => void | Promise<void>;
}) {
  const input = item.input;
  const inputData = asRecord(input);
  const field = isPython ? 'code' : 'command';
  const inputCommand = inputData?.[field];
  const deltaCommand = item.delta?.[field];
  const fieldCommand =
    (typeof inputCommand === 'string' && inputCommand) ||
    (typeof deltaCommand === 'string' && deltaCommand) ||
    undefined;
  const output = item.output;
  const outputData = asRecord(output);
  const exitCode =
    item.returncode ??
    (typeof outputData?.returncode === 'number' || typeof outputData?.returncode === 'string'
      ? outputData.returncode
      : undefined);
  const state = item.state;
  const received = item.type === 'TOOL_RESPONSE' || Boolean(item.responseReceived);
  const waiting = Boolean(item.inputComplete || item.inputEnded || input != null);
  const failed =
    Boolean(item.error) ||
    Boolean(state && state !== 'success' && state !== 'completed') ||
    ((typeof exitCode === 'number' || (typeof exitCode === 'string' && /^-?\d+$/.test(exitCode))) &&
      Number(exitCode) !== 0);

  let label = isPython ? '代码执行' : '命令执行';
  if (received) label += failed ? '失败' : '完成';
  else if (isRunning) label = waiting ? '等待执行结果' : '正在输入参数';

  const otherInput =
    fieldCommand && inputData ? Object.entries(inputData).filter(([key]) => key !== field) : undefined;
  const outputDetails: ToolExecutionDetail[] = [];
  if (received) {
    const seen = new Set<string>();
    for (const [key, val] of [
      ['output', output],
      ['stdout', item.stdout],
      ['stderr', item.stderr],
      ['error', item.error],
    ] as const) {
      const formatted = formatToolDetail(val);
      if (!formatted || seen.has(formatted)) continue;
      seen.add(formatted);
      outputDetails.push({ label: key, value: formatted });
    }
  }

  return (
    <ToolExecutionCard
      icon={isPython ? <FunctionOutlined aria-hidden="true" /> : <CodeOutlined aria-hidden="true" />}
      label={label}
      isRunning={isRunning && !received}
      failed={received && failed}
      details={[
        fieldCommand ? { label: field, value: fieldCommand } : { label: 'input', value: input },
        {
          label: 'input',
          value: otherInput && otherInput.length > 0 ? Object.fromEntries(otherInput) : undefined,
        },
        ...outputDetails,
      ]}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onCopy={onCopy}
    />
  );
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
    case 'TOOL_CALL':
    case 'TOOL_RESPONSE': {
      const command =
        getCommandToolName(item.tool_call_name) ?? getCommandToolName(item.tool_result_name);
      if (command) {
        return renderCommandExecution({
          item,
          isPython: command === 'EXECUTE_PYTHON_CODE',
          isRunning: props.isAnswerStreaming ?? isStreaming,
          expanded: onContentExpandedChange ? (contentExpandedMap?.[collapseKey] ?? false) : undefined,
          onExpandedChange: onContentExpandedChange
            ? (next) => onContentExpandedChange(collapseKey, next)
            : undefined,
          onCopy: props.onCopy,
        });
      }
      if (item.type !== 'TOOL_CALL' || !item.tool_call_name) return null;

      const rawState = item.state?.trim();
      const failedStatus = !isStreaming && rawState && rawState !== 'success' ? rawState : undefined;
      const mcp = /^mcp__(.+?)__(.+)$/.exec(item.tool_call_name);
      const label = failedStatus
        ? `${item.tool_call_name} · ${failedStatus}`
        : mcp
          ? `${isStreaming ? '正在调用 MCP' : '调用 MCP 完成'} : ${mcp[1]} - ${mcp[2]}`
          : item.tool_call_name;
      const rawFilePath = item.delta?.file_path ?? asRecord(item.input)?.file_path;
      const preview = typeof rawFilePath === 'string' ? rawFilePath.split(/[/\\]/).pop() : undefined;
      return (
        <ToolExecutionCard
          icon={mcp ? <ApiOutlined aria-hidden="true" /> : <ToolOutlined aria-hidden="true" />}
          label={label}
          preview={preview}
          isRunning={isStreaming}
          failed={Boolean(failedStatus)}
          details={[
            { label: 'input', value: item.input },
            { label: 'output', value: item.output },
          ]}
          expanded={onContentExpandedChange ? (contentExpandedMap?.[collapseKey] ?? false) : undefined}
          onExpandedChange={onContentExpandedChange
            ? (next) => onContentExpandedChange(collapseKey, next)
            : undefined}
          onCopy={props.onCopy}
        />
      );
    }
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
