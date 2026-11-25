import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCore } from './helpers/load-core.mjs';

const [{ parseDetailFrames, replayTaskRecords }, { createRound, decodeFrame, reduceRound, resolveOpcExecution }] =
  await Promise.all([loadCore('core-detail'), loadCore('core-sse')]);

const wrap = (frame) => '<data>' + JSON.stringify(frame) + '</data>';
const answer = (frames) => frames.map(wrap).join('\n');
const closed = { kind: 'input.end', reason: 'closed' };

function applyStream(roundKey, kind, frames, options) {
  let state = createRound({ roundKey, kind });
  for (const frame of frames) {
    const decoded = decodeFrame(JSON.stringify(frame), options);
    assert.equal(decoded.ok, true);
    state = reduceRound(state, [decoded.event]).state;
  }
  return reduceRound(state, [closed]).state;
}

test('detail frame boundaries ignore JSON string literals and escaped quotes', () => {
  const literal = { type: 'ASSISTANT_MSG', content: [
    '"</DATA><dAtA>abc"',
    '\\',
    '\\"</Data><data>another marker',
    '\\\\</data>',
  ].join('\n') };
  const next = { type: 'STATUS', status: 'started' };
  const tag = '<dAtA>' + JSON.stringify(literal) + '</DaTa>';
  const source = ' \n' + tag + '\r\n' + wrap(next);
  const parsed = parseDetailFrames(source);
  assert.deepEqual(parsed, { frames: [
    { frameIndex: 0, offset: 2, data: literal },
    { frameIndex: 1, offset: tag.length + 4, data: next },
  ], issues: [] });
});

test('detail parsing reports bad JSON, invalid shape and incomplete frames while preserving good frames', () => {
  for (const value of [undefined, null, '', '  ']) {
    assert.deepEqual(parseDetailFrames(value), { frames: [], issues: [] });
  }
  const bad = '<data>{bad}</data>';
  const shape = '<data>[]</data>';
  const truncated = '<data>{"type":"ASSISTANT_MSG","content":"broken</data>';
  const good = wrap({ type: 'TASK_COMPLETED', status: 'success' });
  const tail = '<data>{"type":"STATUS"';
  const parsed = parseDetailFrames(bad + shape + truncated + good + tail);
  assert.deepEqual(parsed.issues, [
    { code: 'invalid_json', frameIndex: 0, offset: 0 },
    { code: 'invalid_frame', frameIndex: 1, offset: bad.length },
    { code: 'invalid_json', frameIndex: 2, offset: bad.length + shape.length },
    { code: 'incomplete_frame', frameIndex: 4, offset: bad.length + shape.length + truncated.length + good.length },
  ]);
  assert.deepEqual(parsed.frames, [
    { frameIndex: 3, offset: bad.length + shape.length + truncated.length, data: { type: 'TASK_COMPLETED', status: 'success' } },
  ]);
});

test('history keeps empty rounds and reports only the affected record and frame offsets', () => {
  assert.deepEqual(replayTaskRecords([]), { kind: 'ordinary', rounds: [], issues: [] });
  const half = '<data>{"type":"STATUS"';
  const unknown = wrap({ type: 'FUTURE_FRAME', secret: 'value' });
  const restored = replayTaskRecords([
    { chatId: 'empty', question: 'Question without answer' },
    { chatId: 'partial', question: 'Partial answer', answer: unknown + half },
    { chatId: 'complete', question: 'Another question', answer: wrap({ type: 'TASK_COMPLETED', status: 'success' }) },
  ]);
  assert.deepEqual(restored.rounds.map((round) => round.chatId), ['empty', 'partial', 'complete']);
  assert.equal(restored.rounds[0].question, 'Question without answer');
  assert.deepEqual(restored.rounds[0].state.contentList, []);
  assert.equal(restored.rounds[2].state.status, 'success');
  assert.deepEqual(restored.issues, [
    { code: 'unknown_frame', frameIndex: 0, offset: 0, recordIndex: 1, chatId: 'partial' },
    { code: 'incomplete_frame', frameIndex: 1, offset: unknown.length, recordIndex: 1, chatId: 'partial' },
  ]);
});

test('history recovers the first complete frame after an unterminated string and missing close tag', () => {
  const truncated = '<data>{"type":"ASSISTANT_MSG","content":"broken';
  const completed = { type: 'TASK_COMPLETED', status: 'success' };
  const record = { chatId: 'r', question: 'Q', answer: truncated + wrap(completed) };
  const restored = replayTaskRecords([record], { kind: 'ordinary' });
  assert.deepEqual(parseDetailFrames(record.answer).frames, [
    { frameIndex: 1, offset: truncated.length, data: completed },
  ]);
  assert.deepEqual(restored.issues, [
    { code: 'invalid_json', frameIndex: 0, offset: 0, recordIndex: 0, chatId: 'r' },
  ]);
  assert.equal(restored.rounds[0].state.status, 'success');
});

test('explicit-kind replay preserves round and diagnostic ordering', () => {
  const records = [
    { chatId: 'first', question: 'Q', answer: answer([{ type: 'TASK_COMPLETED' }, { type: 'TASK_COMPLETED', status: 'success' }]) },
    { chatId: 'second', question: 'Q', answer: '<data>{bad}</data>' },
  ];
  const explicit = replayTaskRecords(records, { kind: 'ordinary' });
  assert.deepEqual(explicit, replayTaskRecords(records));
  assert.deepEqual(explicit.rounds.map(({ state }) => state.status), ['success', 'uncompleted']);
  assert.deepEqual(explicit.issues.map(({ chatId, code }) => [chatId, code]), [
    ['first', 'invalid_frame'],
    ['second', 'invalid_json'],
  ]);
});

test('history associates post-completion user answers to the matching round, frame and type', () => {
  const files = ['IN-01', 'OUT-06', 'OUT-01', 'OUT-02', 'OUT-03', 'EXTRA'].map((fileSource) =>
    Object.freeze({ fileName: fileSource, fileSource, custom: { label: fileSource } }));
  const feedback = Object.freeze({ feedbackType: 'upvoted' });
  const question = {
    type: 'ASK_USER_QUESTION', id: 'question', question: 'Which one?',
    options: [{ id: 'option', text: 'This one' }],
  };
  const row = (chatId, chunkType, chunkId, userMessage, optionId) => ({
    chatId, chunkType, chunkId, userMessage, optionId,
  });
  const record = Object.freeze({
    chatId: 'r', question: 'Initial question', skillName: '', skillCode: 'skill',
    answer: answer([question, { type: 'TASK_COMPLETED', status: 'success' }]),
    files: Object.freeze(files),
    feedback,
    chatAnswerList: Object.freeze([
      row('other', 'ASK_USER_QUESTION', 'question', 'wrong round'),
      row('r', 'ASSISTANT_MSG', 'question', 'wrong frame type'),
      row('r', 'ASK_USER_QUESTION', 'other', 'wrong frame ID'),
      row('r', 'ASK_USER_QUESTION', 'question', ' response ', 'option'),
    ]),
  });
  const restored = replayTaskRecords([record]);
  assert.deepEqual(restored.issues, []);
  const [round] = restored.rounds;
  assert.equal(round.skillName, 'skill');
  assert.equal(round.feedback, feedback);
  assert.equal(round.files, files);
  assert.deepEqual(round.uploadFiles, files.slice(0, 2));
  assert.equal(round.outputFiles[0], files[2]);
  assert.equal(round.outputPkgFiles[0], files[3]);
  assert.equal(round.outputSkillPkgFiles[0], files[4]);
  const block = round.state.contentList.find((item) => item.type === 'ASK_USER_QUESTION');
  assert.deepEqual(block?.userAnswer, { optionId: 'option', userMessage: 'response' });
  assert.equal(round.state.pendingQuestion, undefined);
  assert.equal(round.state.status, 'success');
});

test('ordinary live and stored lifecycle frames produce the same state and preserve custom blocks', () => {
  const frames = [
    { type: 'ASSISTANT_MSG_START', id: 'plain' },
    { type: 'ASSISTANT_MSG', id: 'plain', text_delta: 'one' },
    { type: 'ASSISTANT_MSG', id: 'plain', text_delta: ' ' },
    { type: 'ASSISTANT_MSG_END', id: 'plain', content: 'one two' },
    { type: 'AUDIT_NOTE', id: 'audit', auditId: 'a1' },
    { type: 'TASK_COMPLETED', status: 'success', duration_seconds: 3 },
  ];
  const options = { mapCustomFrame: (frame) => frame.type === 'AUDIT_NOTE'
    ? { kind: 'content', block: { type: frame.type, id: frame.id, auditId: frame.auditId } }
    : undefined };
  const restored = replayTaskRecords([{ chatId: 'r', question: 'Q', answer: answer(frames) }], options);
  assert.deepEqual(restored.issues, []);
  assert.deepEqual(restored.rounds[0].state, applyStream('r', 'ordinary', frames, options));
  assert.equal(restored.rounds[0].state.contentList.find((block) => block.type === 'AUDIT_NOTE')?.auditId, 'a1');
});

test('history identifies OPC only from a valid member start and replays the same assignments and timeline', () => {
  const member = (type, role, id, data = {}) => ({
    ...data, type, reply_id: id, opc: { agent_role: role, agent_id: role, run_id: 'run' },
  });
  const frames = [
    member('OPC_AGENT_REPLY_START', 'leader', 'leader-1'),
    member('ASSISTANT_MSG_END', 'leader', 'leader-1', { id: 'text', content: 'Starting' }),
    member('TOOL_CALL_END', 'leader', 'leader-1', { id: 'assign', tool_call_name: 'TeamAssign', input: { member: 'worker', prompt: 'Inspect' } }),
    member('OPC_AGENT_REPLY_START', 'worker', 'worker-1'),
    member('WORKER_ASSISTANT_MSG_END', 'worker', 'worker-1', { id: 'text', content: 'Done' }),
    member('OPC_AGENT_REPLY_END', 'worker', 'worker-1', { status: 'completed' }),
    member('TOOL_RESPONSE', 'leader', 'leader-1', { id: 'assign', state: 'success', output: 'Done' }),
    { type: 'TASK_COMPLETED', status: 'success' },
  ];
  const record = { chatId: 'r', question: 'Inspect', answer: answer(frames) };
  const invalid = { ...record, answer: answer([
    { type: 'ASSISTANT_MSG', content: 'OPC_AGENT_REPLY_START' },
    { type: 'OPC_AGENT_REPLY_START', reply_id: 'id', opc: { agent_role: 'unknown', agent_id: 'agent' } },
  ]) };
  assert.equal(replayTaskRecords([invalid]).kind, 'ordinary');
  assert.equal(replayTaskRecords([record], { kind: 'ordinary' }).kind, 'ordinary');
  const restored = replayTaskRecords([record]);
  assert.equal(restored.kind, 'opc');
  assert.deepEqual(restored.issues, []);
  const state = restored.rounds[0].state;
  assert.deepEqual(state, applyStream('r', 'opc', frames));
  assert.deepEqual(state.timeline.map((entry) => entry.kind), ['leader', 'dispatch', 'report']);
  const [assignmentId] = state.timeline[1].assignmentIds;
  const execution = resolveOpcExecution(state, { kind: 'assignment', id: assignmentId });
  assert.equal(execution?.assignment?.result?.text, 'Done');
  assert.equal(execution?.reply?.blocks[0]?.content, 'Done');
});

test('OPC handles shared metadata and question answers alongside the timeline in live and history', () => {
  const frames = [
    { type: 'OPC_AGENT_REPLY_START', reply_id: 'leader', opc: { agent_id: 'editor', agent_role: 'leader' } },
    { type: 'OPEN_BROWSER', browserUrl: '/browser' },
    { type: 'USAGE_INFO', usage: { total_tokens: 42 } },
    { type: 'REFERENCE', reference_id: 'ref', tool: 'news_search', content: [{ type: 'text', text: '{"results":[{"title":"参考"}]}' }] },
    { type: 'ASK_USER_QUESTION', id: 'ask', question: '选择方向？', options: [{ id: 'a', text: '夜景' }] },
    { type: 'ASSISTANT_MSG_END', reply_id: 'leader', id: 'text', content: '开始写作' },
    { type: 'CLOSE_BROWSER' },
    { type: 'TASK_COMPLETED', status: 'success' },
  ];
  const initial = createRound({ roundKey: 'r', kind: 'opc' });
  const live = reduceRound(initial, frames.map((frame) => decodeFrame(frame).event));
  assert.equal(live.state.pendingQuestion?.id, 'ask');
  assert.deepEqual(live.intents, [{ type: 'browser.open', url: '/browser' }, { type: 'browser.close' }]);
  const userAnswer = { kind: 'user.answer', sourceId: 'ask', optionId: 'a' };
  const ended = reduceRound(live.state, [userAnswer, closed]).state;
  const restored = replayTaskRecords([{
    chatId: 'r', question: 'Q', answer: answer(frames),
    chatAnswerList: [{ chatId: 'r', chunkId: 'ask', chunkType: 'ASK_USER_QUESTION', optionId: 'a' }],
  }]);
  assert.deepEqual(restored.issues, []);
  assert.deepEqual(restored.rounds[0].state, ended);
  assert.equal(ended.pendingQuestion, undefined);
  assert.equal(ended.contentList[0].userAnswer.optionId, 'a');
  assert.equal(ended.usage.total_tokens, 42);
  assert.equal(ended.referenceList[0].referenceId, 'ref');
  assert.equal(ended.browserClosed, true);
  assert.deepEqual(ended.timeline.map(({ kind }) => kind), ['leader']);
});

test('auto kind detection avoids false positives on literal text, detects late OPC rounds, and matches explicit kind across batched chunks', () => {
  const literalOnly = [
    {
      chatId: 'literal',
      question: 'Q1',
      answer: answer([
        { type: 'ASSISTANT_MSG', content: 'Mention OPC_AGENT_REPLY_START in prose' },
        { type: 'OPC_AGENT_REPLY_START', reply_id: 'missing-opc' },
        { type: 'TASK_COMPLETED', status: 'success' },
      ]),
    },
  ];
  const literalReplay = replayTaskRecords(literalOnly);
  assert.equal(literalReplay.kind, 'ordinary');
  assert.deepEqual(literalReplay, replayTaskRecords(literalOnly, { kind: 'ordinary' }));

  const largeOrdinaryFrames = Array.from({ length: 600 }, (_, i) => ({
    type: 'ASSISTANT_MSG',
    id: 'chunked',
    text_delta: i === 0 ? 'start' : 'x',
  }));
  const largeOrdinary = [{
    chatId: 'large-ordinary',
    question: 'Q',
    answer: answer([...largeOrdinaryFrames, { type: 'TASK_COMPLETED', status: 'success' }]),
  }];
  const largeReplayed = replayTaskRecords(largeOrdinary);
  assert.equal(largeReplayed.kind, 'ordinary');
  assert.equal(largeReplayed.rounds[0].state.contentList[0].content.length, 5 + 599);

  const multiOpc = [
    { chatId: 'first', question: 'Q1', answer: answer([{ type: 'STATUS', status: 'started' }]) },
    {
      chatId: 'second',
      question: 'Q2',
      answer: answer([
        { type: 'OPC_AGENT_REPLY_START', reply_id: 'leader', opc: { agent_id: 'leader', agent_role: 'leader' } },
        ...Array.from({ length: 520 }, (_, i) => ({
          type: 'ASSISTANT_MSG',
          reply_id: 'leader',
          opc: { agent_id: 'leader', agent_role: 'leader' },
          id: 'body',
          text_delta: i === 0 ? 'begin' : '.',
        })),
        { type: 'TASK_COMPLETED', status: 'success' },
      ]),
    },
  ];
  const autoOpc = replayTaskRecords(multiOpc);
  const explicitOpc = replayTaskRecords(multiOpc, { kind: 'opc' });
  assert.equal(autoOpc.kind, 'opc');
  assert.deepEqual(autoOpc, explicitOpc);
  assert.equal(autoOpc.rounds[1].state.replies.leader.blocks[0].content.length, 5 + 519);
});
