import { createOrdinaryRound, reduceOrdinaryRound, type OrdinaryRoundState } from './ordinary.js';
import { createOpcRound, reduceOpcRound, type OpcRoundState } from './opc.js';
import { decodeFrame } from './decode.js';
import type {
  CoreContentBlock, DecodeFrameOptions, FrameIssue, InputEndEvent, RoundEvent, RoundIntent, RoundKind, RoundUpdate,
} from './types.js';

export { decodeFrame };
export { getCommandToolName } from './commandTool.js';
export type { CommandToolName } from './commandTool.js';
export { groupOpcTimeline, isOpcBlockStreaming, resolveOpcExecution } from './opc.js';
export type {
  OpcRoundState, OpcReply, OpcAssignment, OpcBlock, OpcExecutionTarget, OpcTimelineItem, OpcGroupedTimelineEntry,
} from './opc.js';
export type { AnswerMetadata, AnswerQuestionBlock, OrdinaryReference, PendingQuestion } from './answer.js';
export type { OrdinaryRoundState, OrdinaryBlock, OrdinarySubAgent } from './ordinary.js';
export type {
  CoreContentBlock, CustomContentEvent, DecodeFrameOptions, DecodeFrameResult, FrameEvent, FrameIssue,
  InputEndEvent, RoundBase, RoundCompletion, RoundEvent, RoundIntent, RoundKind, RoundStatus,
  RoundTerminalStatus, RoundUpdate, RoundUsage, TextPatch, UserAnswerEvent, WireFrame,
} from './types.js';

export type RoundState<T extends CoreContentBlock = never> = OrdinaryRoundState<T> | OpcRoundState<T>;

interface StreamRoundKey {
  readonly taskId: string;
  readonly answerId: string;
}

export interface StreamBatchTarget<T extends CoreContentBlock = never> extends StreamRoundKey {
  readonly state: RoundState<T>;
  readonly end?: InputEndEvent;
}

export interface StreamBatchFrame extends StreamRoundKey {
  readonly data: unknown;
}

export interface StreamBatchResult<T extends CoreContentBlock = never> {
  readonly updates: readonly Omit<StreamBatchTarget<T>, 'end'>[];
  readonly intents: readonly (RoundIntent & StreamRoundKey & { readonly order: number })[];
  readonly issues: readonly (FrameIssue & StreamRoundKey & { readonly order: number })[];
}

export function createRound<T extends CoreContentBlock = never>(
  options: { roundKey: string; kind: 'ordinary' },
): OrdinaryRoundState<T>;
export function createRound<T extends CoreContentBlock = never>(
  options: { roundKey: string; kind: 'opc' },
): OpcRoundState<T>;
export function createRound<T extends CoreContentBlock = never>(
  options: { roundKey: string; kind: RoundKind },
): RoundState<T>;
export function createRound<T extends CoreContentBlock = never>(
  { roundKey, kind }: { roundKey: string; kind: RoundKind },
): RoundState<T> {
  return kind === 'opc' ? createOpcRound<T>(roundKey) : createOrdinaryRound<T>(roundKey);
}

export function reduceRound<T extends CoreContentBlock = never>(
  previous: OrdinaryRoundState<T>, events: readonly RoundEvent<T>[],
): RoundUpdate<OrdinaryRoundState<T>>;
export function reduceRound<T extends CoreContentBlock = never>(
  previous: OpcRoundState<T>, events: readonly RoundEvent<T>[],
): RoundUpdate<OpcRoundState<T>>;
export function reduceRound<T extends CoreContentBlock = never>(
  previous: RoundState<T>, events: readonly RoundEvent<T>[],
): RoundUpdate<RoundState<T>>;
export function reduceRound<T extends CoreContentBlock = never>(
  previous: RoundState<T>, events: readonly RoundEvent<T>[],
): RoundUpdate<RoundState<T>> {
  return previous.kind === 'opc' ? reduceOpcRound(previous, events) : reduceOrdinaryRound(previous, events);
}

/** 每个 taskId 对应一个当前回答。order 为帧在原始批次中的下标。 */
export function reduceStreamBatch<T extends CoreContentBlock = never>(
  targets: readonly StreamBatchTarget<T>[],
  frames: readonly StreamBatchFrame[],
  options: Pick<DecodeFrameOptions<T>, 'mapCustomFrame'> = {},
): StreamBatchResult<T> {
  const active = new Map(targets.map((target) => [target.taskId, { target, events: [] as RoundEvent<T>[] }]));
  const updates: StreamBatchResult<T>['updates'][number][] = [];
  const intents: StreamBatchResult<T>['intents'][number][] = [];
  const issues: StreamBatchResult<T>['issues'][number][] = [];

  frames.forEach(({ taskId, answerId, data }, order) => {
    const entry = active.get(taskId);
    if (!entry || entry.target.answerId !== answerId) return;
    const { state, end } = entry.target;
    if ((state.kind === 'opc' ? state.inputEnded : state.inputClosed) || (end && end.reason !== 'closed')) return;
    const decoded = decodeFrame(data, options);
    if (!decoded.ok) issues.push({ ...decoded.issue, taskId, answerId, order });
    else entry.events.push(decoded.event.kind === 'frame' ? { ...decoded.event, order } : decoded.event);
  });

  for (const { target: { taskId, answerId, state: previous, end }, events } of active.values()) {
    if (end) events.push(end);
    if (events.length === 0) continue;
    const { state, intents: roundIntents } = reduceRound(previous, events);
    if (state !== previous) updates.push({ taskId, answerId, state });
    for (const intent of roundIntents) {
      if (intent.order !== undefined) intents.push({ ...intent, taskId, answerId, order: intent.order });
    }
  }
  intents.sort((left, right) => left.order - right.order);
  return { updates, intents, issues };
}

export function testCoreSse(): string {
  return 'core-sse:ok';
}
