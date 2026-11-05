import type { CSSProperties, ReactNode } from 'react';

export interface MessageAppearanceProps {
  className?: string;
  style?: CSSProperties;
}

export interface MessageContentExpandedProps {
  contentExpandedMap?: Readonly<Record<string, boolean>>;
  onContentExpandedChange?: (key: string, expanded: boolean) => void;
}

export interface MessageFile {
  fileId?: string;
  fileName: string;
}

export interface SubAgent {
  id: string;
  random_number?: number;
  description?: string;
  prompt?: string;
  creating?: boolean;
  excuting?: boolean;
}

/** 展示所需的最小结构，业务可通过泛型保留自己的附加字段。 */
export interface MessageContent {
  id: string;
  type: string;
  msg_content_id?: string;
  content?: string;
  output?: string;
  tool_call_name?: string;
  tool_result_name?: string;
  contextCompressStatus?: 'unfinished' | 'success' | 'failed';
  question?: string;
  options?: readonly { id: string; text: string }[];
  userAnswer?: { optionId?: string; userMessage?: string };
  subAgentRenderConfig?: { subAgentList: readonly SubAgent[] };
}

export type MessageTextRenderer = (content: string, isStreaming: boolean) => ReactNode;

export function getContentKey(item: MessageContent): string {
  return `${item.type}_${item.msg_content_id || item.id}`;
}

export function getContentCollapseKey(item: MessageContent): string {
  return `${item.id || item.msg_content_id}_${item.type}`;
}
