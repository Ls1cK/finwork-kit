import { asRecord, readId, readString, readUsage } from './protocol.js';
import type { CoreContentBlock, FrameEvent, RoundIntent, RoundUsage, UserAnswerEvent, WireFrame } from './types.js';

export interface QuestionAnswer {
  readonly optionId?: string;
  readonly userMessage?: string;
}

export interface PendingQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly user_input?: { readonly enabled: true; readonly placeholder?: string };
  readonly session_id?: string;
  readonly message?: string;
  readonly context?: string;
}

export interface OrdinaryReference {
  readonly referenceId: string;
  readonly toolCallName: string;
  readonly toolCallId?: string;
  readonly references: readonly Readonly<Partial<Record<
    'id' | 'title' | 'content' | 'summary' | 'url' | 'source' | 'type' | 'published_at', string
  >>>[];
}

export const toolName = (value: unknown) => {
  const name = readId(value);
  return name?.startsWith('mcp__') ? name : name?.toUpperCase();
};

export const lastIndex = <T,>(list: readonly T[], matches: (item: T) => boolean) => {
  for (let index = list.length - 1; index >= 0; index--) if (matches(list[index])) return index;
  return -1;
};

export function sameFields<T extends object>(previous: T, next: T): boolean {
  const keys = Object.keys(next) as (keyof T)[];
  return Object.keys(previous).length === keys.length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(previous, key) && previous[key] === next[key]);
}

function readQuestion(frame: WireFrame, id: string): PendingQuestion | undefined {
  const question = readString(frame.question)?.trim();
  if (!question) return undefined;
  const options = Array.isArray(frame.options) ? frame.options.flatMap((item) => {
    const option = asRecord(item);
    const optionId = readId(option?.id);
    const text = readId(option?.text);
    return optionId && text ? [{ id: optionId, text }] : [];
  }) : [];
  const userInput = asRecord(frame.user_input);
  if (!options.length && userInput?.enabled !== true) return undefined;
  return {
    id, question, options,
    user_input: userInput?.enabled === true ? { enabled: true, placeholder: readString(userInput.placeholder) } : undefined,
    session_id: readId(frame.session_id), message: readString(frame.message), context: readString(frame.context),
  };
}

const referenceFields = ['id', 'title', 'content', 'summary', 'url', 'source', 'type', 'published_at'] as const;

function readReference(frame: WireFrame): OrdinaryReference | undefined {
  const referenceId = readId(frame.reference_id);
  const toolCallName = toolName(frame.tool);
  if (!referenceId || !toolCallName || !Array.isArray(frame.content)) return undefined;
  const textBlock = frame.content.map(asRecord).find((item) => item?.type === 'text');
  if (typeof textBlock?.text !== 'string') return undefined;
  let results: unknown;
  try {
    results = asRecord(JSON.parse(textBlock.text))?.results;
  } catch {
    return undefined;
  }
  if (!Array.isArray(results)) return undefined;
  const references = results.flatMap((result) => {
    const item = asRecord(result);
    if (!item) return [];
    const fields = referenceFields.flatMap((field) => {
      const value = readId(item[field]);
      return value === undefined ? [] : [[field, value] as const];
    });
    return fields.length ? [Object.fromEntries(fields)] : [];
  });
  return references.length ? { referenceId, toolCallName, toolCallId: readId(frame.tool_call_id), references } : undefined;
}

export interface AnswerMetadata {
  readonly usage?: RoundUsage;
  readonly referenceList?: readonly OrdinaryReference[];
  readonly browserUrl?: string;
  /** 区分本轮没有浏览器事件和显式关闭上一轮打开的浏览器。 */
  readonly browserClosed?: true;
  readonly pendingQuestion?: PendingQuestion;
}

export function readAnswerMetadata(previous: AnswerMetadata, { frame, source, order }: FrameEvent):
  { patch?: AnswerMetadata; intent?: RoundIntent } | undefined {
  const intentOrder = order === undefined ? {} : { order };
  switch (frame.type) {
    case 'USAGE_INFO': {
      const usage = readUsage(frame.usage);
      return usage && (!previous.usage || !sameFields(previous.usage, usage)) ? { patch: { usage } } : {};
    }
    case 'REFERENCE': {
      const reference = readReference(frame);
      if (!reference) return {};
      const list = [...previous.referenceList ?? []];
      const index = list.findIndex((item) => item.referenceId === reference.referenceId);
      if (index < 0) list.push(reference);
      else list[index] = reference;
      return { patch: { referenceList: list } };
    }
    case 'OPEN_BROWSER': {
      const url = readId(frame.browserUrl);
      if (!url) return {};
      const patch = previous.browserUrl !== url || previous.browserClosed ? { browserUrl: url, browserClosed: undefined } : undefined;
      return { patch, intent: source === 'stream' ? { type: 'browser.open', url, ...intentOrder } : undefined };
    }
    case 'CLOSE_BROWSER':
      return {
        patch: previous.browserClosed ? undefined : { browserUrl: undefined, browserClosed: true },
        intent: source === 'stream' ? { type: 'browser.close', ...intentOrder } : undefined,
      };
  }
}

interface QuestionFields extends CoreContentBlock {
  readonly sourceId?: string;
  readonly userAnswer?: QuestionAnswer;
}

export interface AnswerQuestionBlock extends QuestionFields {
  readonly type: 'ASK_USER_QUESTION';
  readonly question: string;
  readonly options: PendingQuestion['options'];
  readonly user_input?: PendingQuestion['user_input'];
}

function findQuestionBlock(list: readonly QuestionFields[], sourceId: string) {
  return lastIndex(list, (block) => block.type === 'ASK_USER_QUESTION' && (block.sourceId ?? block.id) === sourceId);
}

export function readQuestionUpdate<B extends QuestionFields>(
  list: readonly B[], frame: WireFrame, nextId: (type: string, sourceId?: string) => string,
) {
  const sourceId = readId(frame.id);
  const index = sourceId ? findQuestionBlock(list, sourceId) : -1;
  const current = list[index];
  const id = current?.id ?? nextId(frame.type, sourceId);
  const question = readQuestion(frame, sourceId ?? id);
  if (!question) return undefined;
  const block: AnswerQuestionBlock = {
    ...current, id, type: 'ASK_USER_QUESTION', sourceId,
    question: question.question, options: question.options, user_input: question.user_input,
  };
  return { index, question, block };
}

export function readUserAnswerUpdate<B extends QuestionFields>(list: readonly B[], event: UserAnswerEvent) {
  const index = findQuestionBlock(list, event.sourceId);
  const optionId = readId(event.optionId);
  const userMessage = readString(event.userMessage)?.trim() || undefined;
  if (index < 0 || (!optionId && !userMessage)) return undefined;
  const current = list[index];
  const block = current.userAnswer?.optionId !== optionId || current.userAnswer?.userMessage !== userMessage
    ? { ...current, userAnswer: { optionId, userMessage } } : undefined;
  return { index, block };
}
