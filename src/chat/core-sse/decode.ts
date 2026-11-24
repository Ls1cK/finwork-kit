import { asRecord, isRoundTerminalStatus, readId, readString } from './protocol.js';
import type { CoreContentBlock, DecodeFrameOptions, DecodeFrameResult, TextPatch, WireFrame } from './types.js';

const lifecycleType = /^(ASSISTANT_MSG|THINK_MSG|TOOL_CALL)(?:_(START|END))?$/;
const textType = /^(?:ASSISTANT_MSG|THINK_MSG)(?:_(?:START|END))?$/;
const conversationTypes = new Set([
  'STATUS', 'PROGRESS', 'ERROR', 'TOOL_RESPONSE', 'USAGE_INFO', 'EXECUTION_USAGE', 'TASK_COMPLETED',
  'SIMULATE_QUESTIONS', 'ASK_USER_QUESTION', 'OPEN_BROWSER', 'CLOSE_BROWSER', 'REFERENCE',
  'CONTEXT_COMPRESSING', 'CONTEXT_COMPRESSED', 'CONTEXT_COMPRESSED_FAILED', 'CONVERSATION_SUMMARY',
  'OUTPUT_FILES', 'EXCLUDE_FILES', 'TASK_PACKAGE', 'OUTPUT_SKILL_FILES',
  'REQUIRE_USER_CONFIRM', 'REQUIRE_EXTERNAL_EXECUTION', 'CONTEXT_COMPRESSION_FAILED',
]);
const agentTypes = new Set([
  'OPC_AGENT_REPLY_START', 'OPC_AGENT_REPLY_END', 'OPC_TEAM_SUMMARY', 'OPC_AGENT_LIMIT_REACHED',
  'SUBAGENT_CREATE', 'SUBAGENT_COMPLETE',
]);

function isKnownFrame(type: string): boolean {
  if (agentTypes.has(type)) return true;
  const unscoped = type.replace(/^(?:WORKER|SUBAGENT)_/, '');
  return lifecycleType.test(unscoped) || conversationTypes.has(unscoped);
}

export function getLifecycle(type: string): { type: string; phase?: string } {
  const match = lifecycleType.exec(type);
  return match ? { type: match[1], phase: match[2] } : { type };
}

export function getTextPatch(frame: WireFrame): TextPatch | undefined {
  if (!textType.test(frame.type.replace(/^(?:WORKER|SUBAGENT)_/, ''))) return undefined;
  const content = readString(frame.content);
  if (content !== undefined) return { mode: 'replace', text: content };
  const delta = readString(frame.text_delta);
  if (delta !== undefined) return { mode: 'append', text: delta };
}

export function decodeFrame<T extends CoreContentBlock = never>(
  input: unknown,
  options: DecodeFrameOptions<T> = {},
): DecodeFrameResult<T> {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, issue: { code: 'invalid_json' } };
    }
  }

  const record = asRecord(value);
  const type = record && Object.prototype.hasOwnProperty.call(record, 'type') && readId(record.type);
  if (!type) return { ok: false, issue: { code: 'invalid_frame' } };
  const frame = record as WireFrame;

  if (isKnownFrame(type)) {
    if (type === 'TASK_COMPLETED' && !isRoundTerminalStatus(frame.status)) {
      return { ok: false, issue: { code: 'invalid_frame', frameType: type } };
    }
    return { ok: true, event: { kind: 'frame', frame, source: options.source ?? 'stream', text: getTextPatch(frame) } };
  }

  const event = options.mapCustomFrame?.(frame);
  if (event === undefined) return { ok: false, issue: { code: 'unknown_frame', frameType: type } };
  const eventRecord = asRecord(event);
  const block = asRecord(eventRecord?.block);
  if (eventRecord?.kind !== 'content' || !block || !readId(block.id) || !readId(block.type) ||
    (block.content !== undefined && typeof block.content !== 'string') ||
    (eventRecord.replyId !== undefined && !readId(eventRecord.replyId))) {
    return { ok: false, issue: { code: 'invalid_frame', frameType: type } };
  }
  return { ok: true, event };
}
