import {
  lastIndex, readAnswerMetadata, readQuestionUpdate, readUserAnswerUpdate, sameFields, toolName,
  type PendingQuestion, type QuestionAnswer,
} from './answer.js';
import { getLifecycle } from './decode.js';
import {
  asRecord, isRoundTerminalStatus, readCompletion, readId, readNumber, readString, readSuggestedQuestions, readUsage,
} from './protocol.js';
import type {
  CoreContentBlock, FrameEvent, RoundBase, RoundEvent, RoundIntent, RoundUpdate, RoundUsage, WireFrame,
} from './types.js';

export interface OrdinarySubAgent {
  readonly id: string;
  readonly name: string;
  readonly agent_type?: string;
  readonly description?: string;
  readonly prompt?: string;
  readonly random_number?: number;
  readonly creating?: boolean;
  readonly excuting?: boolean;
  readonly output?: string;
}

interface SubAgentGroup {
  readonly subAgentList: readonly OrdinarySubAgent[];
  readonly subAgentContents: Readonly<Record<string, OrdinaryRoundState>>;
}

export interface OrdinaryBlock extends CoreContentBlock {
  readonly sourceId?: string;
  readonly lifecycleManaged?: true;
  readonly name?: string;
  readonly tool_call_name?: string;
  readonly tool_result_name?: string;
  readonly tool_call_id?: string;
  readonly delta?: Readonly<Record<string, unknown>>;
  readonly input?: unknown;
  readonly output?: string;
  readonly state?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly returncode?: number | string;
  readonly contextCompressStatus?: 'unfinished' | 'success' | 'failed';
  readonly message?: string;
  readonly question?: string;
  readonly options?: PendingQuestion['options'];
  readonly user_input?: PendingQuestion['user_input'];
  readonly userAnswer?: QuestionAnswer;
  readonly subAgentRenderConfig?: SubAgentGroup;
}

export interface OrdinaryRoundState<T extends CoreContentBlock = never> extends RoundBase {
  readonly kind: 'ordinary';
  readonly contentList: readonly (OrdinaryBlock | T)[];
  readonly activeContentId?: string;
  readonly executionUsage?: RoundUsage;
  readonly suggestedQuestions?: readonly string[];
  /** 归并游标随快照传回，应用只读取展示字段。 */
  readonly lifecycle: Readonly<Record<string, string>>;
  readonly inputClosed?: boolean;
}

export function createOrdinaryRound<T extends CoreContentBlock = never>(roundKey: string): OrdinaryRoundState<T> {
  return { roundKey, kind: 'ordinary', status: 'idle', contentList: [], lifecycle: {} };
}

function readToolFields(frame: WireFrame) {
  const returncode = readNumber(frame.returncode) ?? readString(frame.returncode);
  return {
    ...defined('tool_call_name', toolName(frame.tool_call_name)),
    ...defined('tool_result_name', readId(frame.tool_result_name)),
    ...defined('tool_call_id', readId(frame.tool_call_id)),
    ...defined('delta', asRecord(frame.delta)),
    ...defined('input', frame.input),
    ...defined('output', readString(frame.output)),
    ...defined('state', readString(frame.state)),
    ...defined('stdout', readString(frame.stdout)),
    ...defined('stderr', readString(frame.stderr)),
    ...defined('returncode', returncode),
  };
}

function defined<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}

function getSubAgentGroup(block?: OrdinaryBlock): SubAgentGroup | undefined {
  const group = block?.type === 'SUBAGENTS' ? block.subAgentRenderConfig : undefined;
  return Array.isArray(group?.subAgentList) && asRecord(group.subAgentContents) ? group : undefined;
}

function updateSubAgent<T extends CoreContentBlock>(
  state: OrdinaryRoundState<T>,
  event: FrameEvent,
): OrdinaryRoundState<T> {
  const { frame, source } = event;
  const memberId = readId(frame.id);
  const type = frame.type.slice('SUBAGENT_'.length);
  if (
    type === 'USAGE_INFO' ||
    type === 'CREATE_START' ||
    type === 'CREATE_END' ||
    (type === 'COMPLETE' && source === 'history')
  ) return state;

  const groups = state.contentList;
  const creating = type === 'CREATE';
  const completing = type === 'COMPLETE';
  const agentName = readId(frame.name);
  const matchesMember = (member: OrdinarySubAgent) =>
    (completing ? member.id === memberId : member.name === agentName) &&
    (source === 'history' || member.creating || member.excuting);
  const { type: blockType, phase } = getLifecycle(type);
  const ownsBlock = (group: SubAgentGroup, member: OrdinarySubAgent) => {
    if (!memberId || completing || phase === 'START' || !matchesMember(member)) return false;
    const inner = group.subAgentContents[member.id];
    return !!inner?.contentList.some((block) => block.type === blockType && block.sourceId === memberId);
  };
  let groupIndex = -1;
  if (creating) {
    if (!memberId) return state;
    const priorGroupIndex = lastIndex(groups, (item) => getSubAgentGroup(item) !== undefined);
    if (priorGroupIndex >= 0) {
      const block: OrdinaryBlock = groups[priorGroupIndex];
      const previous = getSubAgentGroup(block);
      const canAdd = previous?.subAgentList.every((member) =>
        !previous.subAgentContents[member.id]?.contentList.length && (source === 'history' || member.creating));
      if (canAdd) groupIndex = priorGroupIndex;
    }
  } else {
    groupIndex = lastIndex(groups, (block: OrdinaryBlock) => {
      const group = getSubAgentGroup(block);
      return !!group?.subAgentList.some((member) => ownsBlock(group, member));
    });
    if (groupIndex < 0) {
      groupIndex = lastIndex(groups, (block: OrdinaryBlock) => !!getSubAgentGroup(block)?.subAgentList.some(matchesMember));
    }
    if (groupIndex < 0) return state;
  }

  const previousGroup: OrdinaryBlock | undefined = groups[groupIndex];
  const group = getSubAgentGroup(previousGroup);
  const members = [...(group?.subAgentList ?? [])];
  const ownerIndex = group ? members.findIndex((member) => ownsBlock(group, member)) : -1;
  const memberIndex = ownerIndex >= 0 ? ownerIndex
    : members.findIndex(creating ? (member) => member.id === memberId : matchesMember);
  let member = members[memberIndex];
  const groupId = previousGroup?.id ?? JSON.stringify([state.roundKey, 'SUBAGENTS', memberId, groups.length]);
  let inner: OrdinaryRoundState;

  if (creating && memberId) {
    const delta = asRecord(frame.delta);
    member = {
      id: memberId, name: readId(delta?.agent_name) ?? agentName ?? memberId,
      ...defined('agent_type', readId(delta?.agent_type)),
      ...defined('description', readString(delta?.description)),
      ...defined('prompt', readString(delta?.prompt)),
      ...defined('random_number', readNumber(frame.random_number)),
      ...(source === 'stream' ? { creating: true, excuting: true } : {}),
    };
    inner = group && Object.prototype.hasOwnProperty.call(group.subAgentContents, memberId)
      ? group.subAgentContents[memberId] : createOrdinaryRound(JSON.stringify([groupId, memberId]));
  } else {
    if (!member || !group) return state;
    const previous = group.subAgentContents[member.id];
    if (completing) {
      inner = reduceOrdinaryRound(previous, [{ kind: 'input.end', reason: 'closed' }]).state;
      member = { ...member, creating: undefined, excuting: undefined, output: readString(frame.output) };
    } else {
      inner = reduceOrdinaryRound(previous, [{ ...event, frame: { ...frame, type } }], true).state;
      if (inner === previous) return state;
      if (member.creating) member = { ...member, creating: undefined, excuting: true };
    }
  }

  if (memberIndex >= 0) members[memberIndex] = member;
  else members.push(member);
  const updated = groups.slice();
  const next = {
    id: groupId, type: 'SUBAGENTS', sourceId: previousGroup?.sourceId ?? memberId,
    subAgentRenderConfig: {
      subAgentList: members,
      subAgentContents: { ...group?.subAgentContents, [member.id]: inner },
    },
  };
  if (groupIndex >= 0) updated[groupIndex] = next;
  else updated.push(next);
  return { ...state, contentList: updated, activeContentId: source === 'stream' ? groupId : state.activeContentId };
}

export function reduceOrdinaryRound<T extends CoreContentBlock = never>(
  previous: OrdinaryRoundState<T>,
  events: readonly RoundEvent<T>[],
  mergeLegacyById = false,
): RoundUpdate<OrdinaryRoundState<T>> {
  let state = previous;
  let ownedList: (OrdinaryBlock | T)[] | undefined;
  let ownedLifecycle: Record<string, string> | undefined;
  const intents: RoundIntent[] = [];

  const writeBlock = (block: OrdinaryBlock | T, index = -1) => {
    const current = state.contentList[index];
    if (current && sameFields(current, block)) return;
    if (!ownedList) {
      ownedList = [...state.contentList];
      state = { ...state, contentList: ownedList };
    }
    if (index < 0) ownedList.push(block);
    else ownedList[index] = block;
  };
  const activate = (id?: string) => {
    if (state.activeContentId !== id) state = { ...state, activeContentId: id };
  };
  const lifecycle = () => {
    if (!ownedLifecycle) {
      ownedLifecycle = { ...state.lifecycle };
      state = { ...state, lifecycle: ownedLifecycle };
    }
    return ownedLifecycle;
  };
  const nextId = (type: string, sourceId?: string) =>
    JSON.stringify([state.roundKey, type, sourceId ?? null, state.contentList.length]);

  const mergeContent = ({ frame, source, text }: FrameEvent) => {
    const { type, phase } = getLifecycle(frame.type);
    const sourceId = readId(frame.id);
    const lifecycleKey = JSON.stringify([type, sourceId ?? null]);
    const activeId = state.lifecycle[lifecycleKey];
    const list = state.contentList;
    const isTool = type === 'TOOL_CALL';
    if (phase === 'START' && activeId) return;
    if (phase === 'END' && !activeId && !text && (!isTool || frame.input === undefined)) return;

    let index = activeId ? lastIndex(list, (block) => block.id === activeId) : -1;
    const last: OrdinaryBlock | undefined = list[list.length - 1];
    if (index < 0 && phase === 'END') {
      if (sourceId) {
        index = lastIndex(list, (block: OrdinaryBlock) => block.type === type && block.sourceId === sourceId);
      } else if (last?.type === type && last.sourceId === undefined) {
        index = list.length - 1;
      }
    }
    if (index < 0 && !phase) {
      if (mergeLegacyById && source === 'stream' && sourceId) {
        index = lastIndex(list, (block: OrdinaryBlock) =>
          !block.lifecycleManaged && block.type === type && block.sourceId === sourceId);
      } else if (last?.type === type && !last.lifecycleManaged && type !== 'TOOL_RESPONSE') {
        const sameId = sourceId === last.sourceId;
        if (isTool ? !!sourceId && sameId && source === 'stream'
          : text?.mode === 'append' ? sameId : source === 'stream') {
          index = list.length - 1;
        }
      }
    }
    if (!isTool && type !== 'TOOL_RESPONSE' && !text && !phase && index < 0) return;

    const current: OrdinaryBlock | undefined = list[index];
    const content = text?.mode === 'replace' ? text.text
      : text?.mode === 'append' ? (current?.content ?? '') + text.text : current?.content;
    const id = current?.id ?? nextId(type, sourceId);
    const block = {
      ...current, id, type, sourceId: sourceId ?? current?.sourceId,
      ...(phase ? { lifecycleManaged: true as const } : {}),
      ...defined('name', readId(frame.name)),
      ...defined('content', content),
      ...(isTool || type === 'TOOL_RESPONSE' ? readToolFields(frame) : {}),
    };
    writeBlock(block, index);

    if (phase === 'START') lifecycle()[lifecycleKey] = id;
    else if (phase === 'END' && activeId) delete lifecycle()[lifecycleKey];
    if (source === 'stream') {
      if (phase !== 'END') activate(id);
      else if (state.activeContentId === id) {
        const activeIds = Object.values(state.lifecycle);
        activate(activeIds[activeIds.length - 1]);
      }
    }
  };

  for (const event of events) {
    if (state.inputClosed) break;
    if (event.kind === 'input.end') {
      const previousStatus = state.status;
      const hasTerminalStatus = isRoundTerminalStatus(previousStatus);
      const status = hasTerminalStatus ? previousStatus
        : event.reason === 'cancelled' ? 'cancelled' : event.reason === 'failed' ? 'error' : 'uncompleted';
      const list = state.contentList;
      list.forEach((item, index) => {
        const block: OrdinaryBlock = item;
        const group = getSubAgentGroup(block);
        if (!group) return;
        const subAgentList = group.subAgentList.map((member) => member.creating || member.excuting
          ? { ...member, creating: undefined, excuting: undefined } : member);
        const subAgentContents = Object.fromEntries(Object.entries(group.subAgentContents)
          .map(([memberId, round]) => [memberId, reduceOrdinaryRound(round, [event]).state]));
        writeBlock({ ...block, subAgentRenderConfig: { subAgentList, subAgentContents } }, index);
      });
      state = {
        ...state, inputClosed: true, status,
        error: state.error ?? (!hasTerminalStatus && event.reason === 'failed' ? event.error : undefined),
        activeContentId: undefined, pendingQuestion: undefined, lifecycle: {},
      };
      continue;
    }
    if (event.kind === 'content') {
      if (event.replyId === undefined) writeBlock(event.block, lastIndex(state.contentList, (block) =>
        block.id === event.block.id && block.type === event.block.type));
      continue;
    }
    if (event.kind === 'user.answer') {
      const answer = readUserAnswerUpdate(state.contentList, event);
      if (!answer) continue;
      if (answer.block) writeBlock(answer.block, answer.index);
      if (state.pendingQuestion?.id === event.sourceId) state = { ...state, pendingQuestion: undefined };
      continue;
    }

    const metadata = readAnswerMetadata(state, event);
    if (metadata) {
      if (metadata.patch) state = { ...state, ...metadata.patch };
      if (metadata.intent) intents.push(metadata.intent);
      continue;
    }

    const { frame, source } = event;
    if (frame.type.startsWith('SUBAGENT_')) {
      const next = updateSubAgent(state, event);
      if (next !== state) {
        state = next;
        ownedList = undefined;
      }
      continue;
    }
    switch (frame.type) {
      case 'STATUS':
        if ((frame.status === 'started' || frame.status === 'running') && state.status === 'idle') {
          state = { ...state, status: 'running' };
        }
        break;
      case 'ERROR': {
        const error = readId(frame.error) ?? readId(frame.message);
        if (error && state.error !== error) state = { ...state, error };
        break;
      }
      case 'TASK_COMPLETED': {
        const completion = readCompletion(frame);
        if (!completion) break;
        const content = readId(frame.content);
        if (content && !state.contentList.some((item) => item.type === 'ASSISTANT_MSG' && item.content?.trim())) {
          writeBlock({ id: nextId('ASSISTANT_MSG'), type: 'ASSISTANT_MSG', content });
        }
        if (!state.completion || !sameFields(state.completion, completion)) {
          state = { ...state, status: completion.status, completion };
        }
        break;
      }
      case 'EXECUTION_USAGE': {
        const usage = readUsage(frame.usage);
        if (usage && (!state.executionUsage || !sameFields(state.executionUsage, usage))) state = { ...state, executionUsage: usage };
        break;
      }
      case 'SIMULATE_QUESTIONS': {
        const questions = readSuggestedQuestions(frame.outputs);
        if (questions.length) state = { ...state, suggestedQuestions: [...state.suggestedQuestions ?? [], ...questions] };
        break;
      }
      case 'ASK_USER_QUESTION': {
        const question = readQuestionUpdate(state.contentList, frame, nextId);
        if (!question) break;
        writeBlock(question.block, question.index);
        if (source === 'stream') {
          if (!question.block.userAnswer) state = { ...state, pendingQuestion: question.question };
          activate(question.block.id);
        }
        break;
      }
      case 'CONTEXT_COMPRESSING': {
        const sourceId = readId(frame.id);
        const id = nextId('CONTEXT_COMPRESS', sourceId);
        writeBlock({
          id, type: 'CONTEXT_COMPRESS', sourceId, contextCompressStatus: 'unfinished',
          ...defined('message', readString(frame.message)),
        });
        if (source === 'stream') activate(id);
        break;
      }
      case 'CONTEXT_COMPRESSED':
      case 'CONTEXT_COMPRESSED_FAILED':
      case 'CONTEXT_COMPRESSION_FAILED': {
        const index = lastIndex(state.contentList, (item) => item.type === 'CONTEXT_COMPRESS');
        const block: OrdinaryBlock | undefined = state.contentList[index];
        if (block?.contextCompressStatus === 'unfinished') {
          writeBlock({
            ...block, contextCompressStatus: frame.type === 'CONTEXT_COMPRESSED' ? 'success' : 'failed',
            ...defined('message', readString(frame.message)),
          }, index);
        }
        break;
      }
      default:
        if (/^(?:ASSISTANT_MSG|THINK_MSG|TOOL_CALL)(?:_(?:START|END))?$/.test(frame.type) || frame.type === 'TOOL_RESPONSE') {
          mergeContent(event);
        }
    }
  }
  return { state, intents };
}
