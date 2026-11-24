import {
  createRound, decodeFrame, reduceRound,
  type CoreContentBlock, type DecodeFrameOptions, type FrameIssue,
  type RoundEvent, type RoundKind, type RoundState,
} from '../core-sse/index.js';
import { asRecord, readId, readString } from '../core-sse/protocol.js';
import { parseDetailFrames, type DetailFrame, type DetailFrameIssue } from './parse.js';

export { parseDetailFrames } from './parse.js';
export type { DetailFrame, DetailFrameIssue, DetailParseResult } from './parse.js';

export interface TaskHistoryFile {
  readonly fileName: string;
  readonly fileId?: string;
  readonly fileSource?: string | null;
}

export interface TaskHistoryFeedback {
  readonly feedbackType: string | null;
  readonly chatId?: string;
  readonly reasons?: readonly string[] | null;
  readonly content?: string | null;
}

export interface TaskHistoryAnswer {
  readonly chatId: string;
  readonly chunkId: string;
  readonly chunkType: string;
  readonly optionId?: string | null;
  readonly userMessage?: string | null;
}

export interface TaskHistoryRecord<TFile extends TaskHistoryFile = TaskHistoryFile> {
  readonly chatId: string;
  readonly question: string;
  readonly createTime?: string | null;
  readonly skillName?: string | null;
  readonly skillCode?: string | null;
  readonly answer?: string | null;
  readonly files?: readonly TFile[] | null;
  readonly feedback?: TaskHistoryFeedback | null;
  readonly chatAnswerList?: readonly TaskHistoryAnswer[] | null;
}

export interface ReplayTaskRecordsOptions<T extends CoreContentBlock = never> {
  readonly kind?: RoundKind;
  readonly mapCustomFrame?: DecodeFrameOptions<T>['mapCustomFrame'];
}

export interface ReplayedTaskRound<T extends CoreContentBlock = never, TFile extends TaskHistoryFile = TaskHistoryFile> {
  readonly chatId: string;
  readonly question: string;
  readonly createTime?: string;
  readonly skillName?: string;
  readonly feedback?: TaskHistoryFeedback | null;
  readonly files: readonly TFile[];
  readonly uploadFiles: readonly TFile[];
  readonly outputFiles: readonly TFile[];
  readonly outputPkgFiles: readonly TFile[];
  readonly outputSkillPkgFiles: readonly TFile[];
  readonly state: RoundState<T>;
}

export interface TaskHistoryIssue extends Omit<DetailFrameIssue, 'code'> {
  readonly code: DetailFrameIssue['code'] | FrameIssue['code'];
  readonly recordIndex: number;
  readonly chatId: string;
}

export interface ReplayedTaskRecords<T extends CoreContentBlock = never, TFile extends TaskHistoryFile = TaskHistoryFile> {
  readonly kind: RoundKind;
  readonly rounds: readonly ReplayedTaskRound<T, TFile>[];
  readonly issues: readonly TaskHistoryIssue[];
}

function isOpcReplyStart({ data }: DetailFrame): boolean {
  if (data.type !== 'OPC_AGENT_REPLY_START' || !readId(data.reply_id)) return false;
  const opc = asRecord(data.opc);
  return Boolean(readId(opc?.agent_id) && (opc?.agent_role === 'leader' || opc?.agent_role === 'worker'));
}

function appendUserAnswers<T extends CoreContentBlock>(
  record: TaskHistoryRecord,
  events: RoundEvent<T>[],
): void {
  const seen = new Set<string>();
  for (const answer of record.chatAnswerList ?? []) {
    if (answer?.chatId !== record.chatId || answer.chunkType !== 'ASK_USER_QUESTION') continue;
    const sourceId = readId(answer.chunkId);
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);

    const optionId = readId(answer.optionId);
    const userMessage = readString(answer.userMessage)?.trim() || undefined;
    if (optionId || userMessage) events.push({ kind: 'user.answer', sourceId, optionId, userMessage });
  }
}

export function replayTaskRecords<T extends CoreContentBlock = never, TFile extends TaskHistoryFile = TaskHistoryFile>(
  records: readonly TaskHistoryRecord<TFile>[],
  options: ReplayTaskRecordsOptions<T> = {},
): ReplayedTaskRecords<T, TFile> {
  const parsed = options.kind === undefined ? records.map((record) => parseDetailFrames(record.answer)) : undefined;
  const kind = options.kind ?? (parsed?.some(({ frames }) => frames.some(isOpcReplyStart)) ? 'opc' : 'ordinary');
  const issues: TaskHistoryIssue[] = [];
  const decodeOptions: DecodeFrameOptions<T> = { source: 'history', mapCustomFrame: options.mapCustomFrame };

  const rounds = records.map((record, recordIndex): ReplayedTaskRound<T, TFile> => {
    const { chatId, question, createTime, skillName, skillCode, feedback } = record;
    const { frames, issues: parseIssues } = parsed?.[recordIndex] ?? parseDetailFrames(record.answer);
    for (const issue of parseIssues) issues.push({ ...issue, recordIndex, chatId });

    const events: RoundEvent<T>[] = [];
    for (const { data, frameIndex, offset } of frames) {
      const decoded = decodeFrame(data, decodeOptions);
      if (decoded.ok) events.push(decoded.event);
      else issues.push({ code: decoded.issue.code, frameIndex, offset, recordIndex, chatId });
    }
    appendUserAnswers(record, events);
    events.push({ kind: 'input.end', reason: 'closed' });

    const { state } = reduceRound(createRound<T>({ roundKey: chatId, kind }), events);
    const files = record.files ?? [];
    return {
      chatId,
      question,
      createTime: createTime ?? undefined,
      skillName: skillName || skillCode || undefined,
      feedback,
      files,
      uploadFiles: files.filter((file) => file?.fileSource === 'IN-01' || file?.fileSource === 'OUT-06'),
      outputFiles: files.filter((file) => file?.fileSource === 'OUT-01'),
      outputPkgFiles: files.filter((file) => file?.fileSource === 'OUT-02'),
      outputSkillPkgFiles: files.filter((file) => file?.fileSource === 'OUT-03'),
      state,
    };
  });
  issues.sort((left, right) => left.recordIndex - right.recordIndex || left.frameIndex - right.frameIndex);
  return { kind, rounds, issues };
}

export function testCoreDetail(): string {
  return 'core-detail:ok';
}
