import { readAnswerMetadata, readQuestionUpdate, readUserAnswerUpdate, sameFields, type AnswerMetadata, type AnswerQuestionBlock } from './answer.js';
import {
  asRecord,
  isRoundTerminalStatus,
  readCompletion,
  readId,
  readString,
  readSuggestedQuestions,
  readUsage,
} from './protocol.js';
import type {
  CoreContentBlock,
  FrameEvent,
  InputEndEvent,
  RoundBase,
  RoundEvent,
  RoundIntent,
  RoundUpdate,
  RoundUsage,
  WireFrame,
} from './types.js';

interface OpcTextBlock extends CoreContentBlock {
  readonly type: 'THINK_MSG' | 'ASSISTANT_MSG';
  readonly sourceId: string;
  readonly content: string;
  readonly streaming: boolean;
}

interface OpcToolBlock extends CoreContentBlock {
  readonly type: 'TOOL_CALL';
  readonly sourceId: string;
  readonly tool_call_name?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state?: string;
  readonly inputEnded?: true;
}

export type OpcBlock = OpcTextBlock | OpcToolBlock;

export interface OpcReply<T extends CoreContentBlock = never> {
  readonly id: string;
  readonly member: string;
  readonly name: string;
  readonly role: 'leader' | 'worker';
  readonly avatarUrl?: string;
  readonly status: 'running' | 'completed' | 'cancelled' | 'uncompleted' | 'error';
  readonly startedAt?: number;
  readonly durationMs?: number;
  readonly blocks: readonly OpcBlock[];
  readonly customContent?: readonly T[];
}

export interface OpcAssignment {
  readonly id: string;
  readonly member: string;
  readonly prompt: string;
  readonly replyId?: string;
  readonly result?: { readonly state: string; readonly text: string };
}

export type OpcTimelineItem =
  | { readonly kind: 'leader'; readonly replyId: string; readonly blockId: string }
  | { readonly kind: 'dispatch'; readonly assignmentIds: readonly string[] }
  | { readonly kind: 'report'; readonly replyId: string };

export interface OpcRoundState<T extends CoreContentBlock = never> extends RoundBase {
  readonly kind: 'opc';
  readonly contentList?: readonly AnswerQuestionBlock[];
  readonly inputEnded?: true;
  readonly runId?: string;
  readonly timeline: readonly OpcTimelineItem[];
  readonly replies: Readonly<Partial<Record<string, OpcReply<T>>>>;
  readonly assignments: Readonly<Partial<Record<string, OpcAssignment>>>;
  readonly summary?: string;
  readonly executionUsage?: RoundUsage;
  readonly suggestedQuestions?: readonly string[];
  readonly customContent?: readonly T[];
}

export type OpcExecutionTarget = { readonly kind: 'assignment' | 'reply'; readonly id: string };

export function resolveOpcExecution<T extends CoreContentBlock>(
  state: OpcRoundState<T>,
  target: OpcExecutionTarget,
): { readonly assignment?: OpcAssignment; readonly reply?: OpcReply<T> } | undefined {
  if (target.kind === 'assignment') {
    const assignment = ownValue(state.assignments, target.id);
    if (!assignment) return undefined;
    const reply = assignment.replyId ? ownValue(state.replies, assignment.replyId) : undefined;
    return { assignment, reply };
  }
  const reply = ownValue(state.replies, target.id);
  if (!reply) return undefined;
  const assignment = Object.values(state.assignments).find((item) => item?.replyId === reply.id);
  return { assignment, reply };
}

function ownValue<T>(index: Readonly<Partial<Record<string, T>>>, id: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(index, id) ? index[id] : undefined;
}

export function createOpcRound<T extends CoreContentBlock = never>(roundKey: string): OpcRoundState<T> {
  return { kind: 'opc', roundKey, status: 'idle', timeline: [], replies: Object.create(null), assignments: Object.create(null) };
}

function createDraft<T extends CoreContentBlock>(previous: OpcRoundState<T>) {
  const state = { ...previous };
  let changed = false;
  let replies: Partial<Record<string, OpcReply<T>>> | undefined;
  let assignments: Partial<Record<string, OpcAssignment>> | undefined;
  let timeline: OpcTimelineItem[] | undefined;
  const ownedBlocks = new Map<string, OpcBlock[]>();

  function set<K extends keyof OpcRoundState<T>>(key: K, value: OpcRoundState<T>[K]) {
    if (state[key] === value) return;
    state[key] = value;
    changed = true;
  }

  function putReply(reply: OpcReply<T>) {
    const index = replies ??= Object.assign(Object.create(null), state.replies);
    index[reply.id] = reply;
    set('replies', index);
  }

  return {
    state,
    set,
    putReply,
    applyMetadata(patch: AnswerMetadata) {
      Object.assign(state, patch);
      changed = true;
    },
    putAssignment(assignment: OpcAssignment) {
      const index = assignments ??= Object.assign(Object.create(null), state.assignments);
      index[assignment.id] = assignment;
      set('assignments', index);
    },
    putBlock(reply: OpcReply<T>, index: number, block: OpcBlock) {
      let blocks = ownedBlocks.get(reply.id);
      if (!blocks || blocks !== reply.blocks) {
        blocks = [...reply.blocks];
        ownedBlocks.set(reply.id, blocks);
        putReply({ ...reply, blocks });
      }
      if (index === -1) blocks.push(block);
      else blocks[index] = block;
    },
    appendTimeline(item: OpcTimelineItem) {
      const items = timeline ??= [...state.timeline];
      const last = items[items.length - 1];
      if (item.kind === 'dispatch' && last?.kind === 'dispatch') {
        items[items.length - 1] = { ...last, assignmentIds: [...last.assignmentIds, ...item.assignmentIds] };
      } else {
        items.push(item);
      }
      set('timeline', items);
    },
    result() {
      return changed ? state : previous;
    },
  };
}

type Draft<T extends CoreContentBlock> = ReturnType<typeof createDraft<T>>;

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!match) return undefined;
  const [, date, hour, minute, second, fraction = '', zone = 'Z'] = match;
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) return undefined;
  // OPC timestamps without an offset use a common UTC base for relative durations.
  const offset = zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone;
  const timestamp = Date.parse(`${date}T${hour}:${minute}:${second}.${fraction.padEnd(3, '0').slice(0, 3)}${offset}`);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sealBlocks(blocks: readonly OpcBlock[]): readonly OpcBlock[] {
  if (!blocks.some((block) => block.type !== 'TOOL_CALL' && block.streaming)) return blocks;
  return blocks.map((block) => block.type !== 'TOOL_CALL' && block.streaming ? { ...block, streaming: false } : block);
}

function applyRoundFrame<T extends CoreContentBlock>(draft: Draft<T>, frame: WireFrame): boolean | undefined {
  switch (frame.type) {
    case 'STATUS':
      if (frame.status !== 'started' || isRoundTerminalStatus(draft.state.status)) return false;
      draft.set('status', 'running');
      return true;
    case 'ERROR': {
      const error = readId(frame.error) ?? readId(frame.message) ?? readId(frame.code);
      if (error === undefined) return false;
      draft.set('error', error);
      return true;
    }
    case 'OPC_TEAM_SUMMARY': {
      const summary = readString(frame.leader_final);
      if (summary === undefined) return false;
      draft.set('summary', summary);
      return true;
    }
    case 'EXECUTION_USAGE': {
      const usage = readUsage(frame.usage);
      if (usage === undefined) return false;
      draft.set('executionUsage', usage);
      return true;
    }
    case 'SIMULATE_QUESTIONS': {
      const questions = readSuggestedQuestions(frame.outputs);
      if (questions.length === 0) return false;
      draft.set('suggestedQuestions', [...(draft.state.suggestedQuestions ?? []), ...questions]);
      return true;
    }
    case 'TASK_COMPLETED': {
      const completion = readCompletion(frame);
      if (!completion) return false;
      if (!draft.state.completion || !sameFields(draft.state.completion, completion)) {
        draft.set('completion', completion);
      }
      draft.set('status', completion.status);
      return true;
    }
    default:
      return undefined;
  }
}

function replyStatus(value: unknown): 'completed' | 'cancelled' | 'error' | 'uncompleted' {
  if (value === 'completed' || value === 'cancelled' || value === 'error') return value;
  return 'uncompleted';
}

function updateTool<T extends CoreContentBlock>(
  draft: Draft<T>,
  reply: OpcReply<T>,
  frame: WireFrame,
  type: string,
  sourceId: string,
): boolean {
  if (type !== 'TOOL_CALL' && type !== 'TOOL_CALL_START' && type !== 'TOOL_CALL_END' && type !== 'TOOL_RESPONSE') return false;
  const assignmentId = JSON.stringify([reply.id, sourceId]);
  const assignment = ownValue(draft.state.assignments, assignmentId);
  if (reply.status !== 'running' && (type !== 'TOOL_RESPONSE' || !assignment)) return false;

  const blockId = JSON.stringify([draft.state.roundKey, reply.id, 'TOOL_CALL', sourceId]);
  const index = reply.blocks.findIndex((block) => block.id === blockId);
  const block = reply.blocks[index];
  const previous = block?.type === 'TOOL_CALL' ? block : undefined;
  if (type !== 'TOOL_RESPONSE' && (previous?.inputEnded || (type === 'TOOL_CALL_START' && previous))) return false;

  const toolName = readId(frame.tool_call_name) ?? previous?.tool_call_name ?? readId(frame.tool_result_name);
  const input = (type === 'TOOL_CALL' ? frame.delta ?? frame.input : frame.input) ?? previous?.input;
  const output = frame.output ?? previous?.output;
  const status = readId(frame.state) ?? previous?.state;
  const inputEnded = type === 'TOOL_CALL_END' ? true : previous?.inputEnded;
  if (type === 'TOOL_CALL_END' && toolName === 'TeamAssign' && reply.role === 'leader' && !assignment) {
    const finalInput = asRecord(frame.input);
    const member = readId(finalInput?.member);
    if (member) {
      draft.putAssignment({ id: assignmentId, member, prompt: readString(finalInput?.prompt) ?? '' });
      draft.appendTimeline({ kind: 'dispatch', assignmentIds: [assignmentId] });
    }
  }
  if (type === 'TOOL_RESPONSE' && assignment) {
    const result = { state: readString(frame.state) ?? '', text: readString(frame.output) ?? '' };
    if (assignment.result?.state !== result.state || assignment.result?.text !== result.text) {
      draft.putAssignment({ ...assignment, result });
    }
  }

  if (previous && previous.tool_call_name === toolName && previous.input === input &&
    previous.output === output && previous.state === status && previous.inputEnded === inputEnded) return true;
  draft.putBlock(reply, index, {
    id: blockId, type: 'TOOL_CALL', sourceId, tool_call_name: toolName, input, output, state: status, inputEnded,
  });
  return true;
}

function applyReplyFrame<T extends CoreContentBlock>(
  draft: Draft<T>,
  event: FrameEvent,
  opc: Record<string, unknown> | undefined,
): boolean {
  const { frame } = event;
  const replyId = readId(frame.reply_id);
  if (!replyId) return false;
  const reply = ownValue(draft.state.replies, replyId);

  if (frame.type === 'OPC_AGENT_REPLY_START') {
    const role = opc?.agent_role;
    const member = readId(opc?.agent_id);
    if (reply || !member || (role !== 'leader' && role !== 'worker')) return false;
    if (draft.state.status === 'idle') draft.set('status', 'running');
    draft.putReply({
      id: replyId, member, role, name: readId(frame.name) ?? member, avatarUrl: readId(opc?.agent_avatar_url),
      status: 'running', startedAt: parseTimestamp(frame.created_at), blocks: [],
    });
    if (role === 'worker') {
      // The protocol runs a member's assignments in dispatch order.
      const assignment = Object.values(draft.state.assignments).find((item) => item?.member === member && !item.replyId && !item.result);
      if (assignment) draft.putAssignment({ ...assignment, replyId });
    }
    return true;
  }
  if (!reply) return false;
  if (frame.type === 'OPC_AGENT_REPLY_END') {
    if (reply.status !== 'running') return false;
    const endedAt = parseTimestamp(frame.created_at);
    const durationMs = endedAt !== undefined && reply.startedAt !== undefined && endedAt >= reply.startedAt
      ? endedAt - reply.startedAt
      : undefined;
    draft.putReply({ ...reply, status: replyStatus(frame.status), durationMs, blocks: sealBlocks(reply.blocks) });
    if (reply.role === 'worker') draft.appendTimeline({ kind: 'report', replyId });
    return true;
  }

  const sourceId = readId(frame.id);
  const workerFrame = frame.type.startsWith('WORKER_');
  if (!sourceId || workerFrame !== (reply.role === 'worker')) return false;
  const type = workerFrame ? frame.type.slice('WORKER_'.length) : frame.type;
  const blockType = type.replace(/_(START|END)$/, '');
  if (blockType !== 'ASSISTANT_MSG' && blockType !== 'THINK_MSG') {
    return updateTool(draft, reply, frame, type, sourceId);
  }
  if (reply.status !== 'running') return false;

  const blockId = JSON.stringify([draft.state.roundKey, replyId, blockType, sourceId]);
  const index = reply.blocks.findIndex((block) => block.id === blockId);
  const block = reply.blocks[index];
  const previous = block?.type === blockType ? block : undefined;
  if (previous && (!previous.streaming || type.endsWith('_START'))) return false;

  const oldText = previous?.content ?? '';
  const patch = event.text;
  const content = patch?.mode === 'replace' ? patch.text : oldText + (patch?.text ?? '');
  const streaming = !type.endsWith('_END');
  if (previous && content === oldText && streaming === previous.streaming) return true;
  draft.putBlock(reply, index, { id: blockId, sourceId, type: blockType, content, streaming });
  if (index === -1 && reply.role === 'leader' && blockType === 'ASSISTANT_MSG') {
    draft.appendTimeline({ kind: 'leader', replyId, blockId });
  }
  return true;
}

function endInput<T extends CoreContentBlock>(draft: Draft<T>, event: InputEndEvent) {
  if (!isRoundTerminalStatus(draft.state.status)) {
    const status = event.reason === 'cancelled' ? 'cancelled' : event.reason === 'failed' ? 'error' : 'uncompleted';
    draft.set('status', status);
    if (event.error && status === 'error' && !draft.state.error) draft.set('error', event.error);
  }
  const status = draft.state.status === 'cancelled' || draft.state.status === 'error' ? draft.state.status : 'uncompleted';
  for (const reply of Object.values(draft.state.replies)) {
    if (reply?.status === 'running') draft.putReply({ ...reply, status, blocks: sealBlocks(reply.blocks) });
  }
  draft.applyMetadata({ pendingQuestion: undefined });
  draft.set('inputEnded', true);
}

export function reduceOpcRound<T extends CoreContentBlock = never>(
  previous: OpcRoundState<T>,
  events: readonly RoundEvent<T>[],
): RoundUpdate<OpcRoundState<T>> {
  if (previous.inputEnded || events.length === 0) return { state: previous, intents: [] };
  const draft = createDraft(previous);
  const intents: RoundIntent[] = [];
  for (const event of events) {
    if (event.kind === 'input.end') {
      endInput(draft, event);
      break;
    }
    if (event.kind === 'frame') {
      const opc = asRecord(event.frame.opc);
      const runId = readId(opc?.run_id);
      if (runId && draft.state.runId && runId !== draft.state.runId) continue;
      const metadata = readAnswerMetadata(draft.state, event);
      if (metadata) {
        if (metadata.patch) draft.applyMetadata(metadata.patch);
        if (metadata.intent) intents.push(metadata.intent);
        continue;
      }
      if (event.frame.type === 'ASK_USER_QUESTION') {
        const list = draft.state.contentList ?? [];
        const question = readQuestionUpdate(list, event.frame, (type, sourceId) =>
          JSON.stringify([draft.state.roundKey, type, sourceId ?? null, list.length]));
        if (question) {
          const content = list.slice();
          if (question.index < 0) content.push(question.block);
          else content[question.index] = question.block;
          draft.set('contentList', content);
          if (event.source === 'stream' && !question.block.userAnswer) draft.set('pendingQuestion', question.question);
        }
        continue;
      }
      const accepted = applyRoundFrame(draft, event.frame) ?? applyReplyFrame(draft, event, opc);
      if (accepted && runId) draft.set('runId', runId);
      continue;
    }
    if (event.kind === 'user.answer') {
      const list = draft.state.contentList ?? [];
      const answer = readUserAnswerUpdate(list, event);
      if (!answer) continue;
      if (answer.block) {
        const content = list.slice();
        content[answer.index] = answer.block;
        draft.set('contentList', content);
      }
      if (draft.state.pendingQuestion?.id === event.sourceId) draft.set('pendingQuestion', undefined);
      continue;
    }
    if (event.kind === 'content') {
      if (event.replyId) {
        const reply = ownValue(draft.state.replies, event.replyId);
        if (reply) draft.putReply({ ...reply, customContent: [...(reply.customContent ?? []), event.block] });
      } else {
        draft.set('customContent', [...(draft.state.customContent ?? []), event.block]);
      }
    }
  }
  return { state: draft.result(), intents };
}
