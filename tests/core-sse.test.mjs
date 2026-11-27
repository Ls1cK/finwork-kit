import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCore } from './helpers/load-core.mjs';

const { createRound, decodeFrame, getCommandToolName, reduceRound, reduceStreamBatch } = await loadCore('core-sse');

const createOrdinary = () => createRound({ roundKey: 'round', kind: 'ordinary' });

function frames(values, options) {
  return values.map((value) => {
    const decoded = decodeFrame(value, options);
    assert.equal(decoded.ok, true, JSON.stringify(decoded));
    return decoded.event;
  });
}

test('ordinary lifecycle isolates kinds and retains block ids across batches', () => {
  const values = [
    { type: 'THINK_MSG_START', id: 'shared' },
    { type: 'ASSISTANT_MSG_START', id: 'shared' },
    { type: 'THINK_MSG', id: 'shared', content: 'draft' },
    { type: 'ASSISTANT_MSG', id: 'shared', text_delta: 'hello' },
    { type: 'THINK_MSG_END', id: 'shared' },
    { type: 'ASSISTANT_MSG_END', id: 'shared', content: 'hello world', text_delta: ' world' },
  ].map(Object.freeze);
  const events = frames(values);
  const initial = Object.freeze(createOrdinary());
  const first = reduceRound(initial, events.slice(0, 4)).state;
  const snapshot = JSON.stringify(first);
  const final = reduceRound(first, events.slice(4)).state;
  assert.equal(JSON.stringify(first), snapshot);
  assert.deepEqual(initial.contentList, []);
  assert.deepEqual(final, reduceRound(initial, events).state);
  assert.deepEqual(final.contentList.map(({ type, content }) => [type, content]),
    [['THINK_MSG', 'draft'], ['ASSISTANT_MSG', 'hello world']]);
  assert.equal(final.contentList[0], first.contentList[0]);
  assert.equal(final.contentList[1].id, first.contentList[1].id);
  assert.equal(final.activeContentId, undefined);
});

test('a mixed stream batch isolates stale answers and orders ordinary and OPC browser intents', () => {
  const targets = Object.freeze([
    Object.freeze({ taskId: 'ordinary', answerId: 'a', state: Object.freeze(createOrdinary()) }),
    Object.freeze({ taskId: 'opc', answerId: 'b', state: Object.freeze(createRound({ roundKey: 'b', kind: 'opc' })) }),
  ]);
  const result = reduceStreamBatch(targets, [
    { taskId: 'opc', answerId: 'stale', data: { type: 'ERROR', error: 'old' } },
    { taskId: 'ordinary', answerId: 'a', data: { type: 'OPEN_BROWSER', browserUrl: '/a' } },
    { taskId: 'opc', answerId: 'b', data: { type: 'OPEN_BROWSER', browserUrl: '/b' } },
    { taskId: 'ordinary', answerId: 'a', data: { type: 'CLOSE_BROWSER' } },
    { taskId: 'opc', answerId: 'b', data: 'broken' },
    { taskId: 'opc', answerId: 'b', data: { type: 'TASK_COMPLETED', status: 'success' } },
  ]);
  assert.deepEqual(result.intents, [
    { type: 'browser.open', url: '/a', taskId: 'ordinary', answerId: 'a', order: 1 },
    { type: 'browser.open', url: '/b', taskId: 'opc', answerId: 'b', order: 2 },
    { type: 'browser.close', taskId: 'ordinary', answerId: 'a', order: 3 },
  ]);
  assert.deepEqual(result.issues, [{ code: 'invalid_json', taskId: 'opc', answerId: 'b', order: 4 }]);
  assert.equal(result.updates[0].state.browserClosed, true);
  assert.equal(result.updates[1].state.status, 'success');
  assert.equal(result.updates[1].state.error, undefined);
  assert.equal(targets[1].state.browserUrl, undefined);
});

test('only natural close consumes the queued tail; retired answers ignore further frames', () => {
  for (const kind of ['ordinary', 'opc']) {
    const frames = [
      { taskId: 'task', answerId: 'a', data: { type: 'OPEN_BROWSER', browserUrl: '/preview' } },
      { taskId: 'task', answerId: 'a', data: { type: 'TASK_COMPLETED', status: 'success' } },
    ];
    for (const [reason, status] of [['closed', 'success'], ['cancelled', 'cancelled'], ['failed', 'error']]) {
      const { updates: [answer], intents } = reduceStreamBatch([{
        taskId: 'task', answerId: 'a', state: createRound({ roundKey: 'a', kind }),
        end: { kind: 'input.end', reason },
      }], frames);
      assert.equal(answer.state.status, status);
      assert.equal(intents.length, reason === 'closed' ? 1 : 0);
      assert.deepEqual(reduceStreamBatch([answer], frames), { updates: [], intents: [], issues: [] });
    }
  }
});

test('a legacy blank snapshot cannot replace streamed assistant content', () => {
  const state = reduceRound(createOrdinary(), frames([
    { type: 'ASSISTANT_MSG', id: 'initial', content: ' ' },
    { type: 'ASSISTANT_MSG', id: 'answer', content: '普通回答' },
    { type: 'ASSISTANT_MSG', id: 'blank', content: ' ' },
  ])).state;
  assert.deepEqual(state.contentList.map(({ content }) => content), ['普通回答']);
});

test('ordinary delta-only recordings preserve spaces and legacy history snapshots remain distinct', () => {
  const values = [
    { type: 'ASSISTANT_MSG', text_delta: 'hello' },
    { type: 'ASSISTANT_MSG', text_delta: ' ' },
    { type: 'ASSISTANT_MSG', text_delta: 'world' },
    { type: 'ASSISTANT_MSG_END', content: 'hello world' },
    { type: 'TASK_COMPLETED', status: 'success', content: 'hello world' },
  ];
  for (const source of ['stream', 'history']) {
    const result = reduceRound(createOrdinary(), [...frames(values, { source }), { kind: 'input.end', reason: 'closed' }]).state;
    assert.deepEqual(result.contentList.map(({ content }) => content), ['hello world']);
    assert.equal(result.status, 'success');
    assert.equal(result.activeContentId, undefined);
  }
  const snapshots = [
    { type: 'ASSISTANT_MSG', id: 'first', content: 'a' },
    { type: 'ASSISTANT_MSG', id: 'second', content: 'ab' },
  ];
  assert.deepEqual(reduceRound(createOrdinary(), frames(snapshots)).state.contentList.map(({ content }) => content), ['ab']);
  assert.deepEqual(reduceRound(createOrdinary(), frames(snapshots, { source: 'history' })).state.contentList
    .map(({ content }) => content), ['a', 'ab']);
});

test('legacy snapshots never replace open or completed lifecycle blocks', () => {
  const start = { type: 'ASSISTANT_MSG_START', id: 'a' };
  const partial = { type: 'ASSISTANT_MSG', id: 'a', content: 'Part A' };
  const end = { type: 'ASSISTANT_MSG_END', id: 'a', content: 'Answer A' };
  const legacy = { type: 'ASSISTANT_MSG', id: 'b', content: 'Answer B' };
  for (const events of [[start, partial, legacy, end], [start, end, legacy]]) {
    const result = reduceRound(createOrdinary(), frames(events)).state;
    assert.deepEqual(result.contentList.map(({ content }) => content), ['Answer A', 'Answer B']);
  }
});

test('tool snapshots replace payloads, command tools merge responses, and non-command tools stay separate', () => {
  assert.equal(getCommandToolName('bash'), 'BASH');
  assert.equal(getCommandToolName('Execute_Shell_Command'), 'EXECUTE_SHELL_COMMAND');
  assert.equal(getCommandToolName('EXECUTE_PYTHON_CODE'), 'EXECUTE_PYTHON_CODE');
  assert.equal(getCommandToolName('READ_FILE'), undefined);
  assert.equal(getCommandToolName(null), undefined);

  const events = frames([
    { type: 'TOOL_CALL_START', id: 'first', tool_call_name: 'bash' },
    { type: 'TOOL_CALL_START', id: 'second', tool_call_name: 'mcp__read' },
    { type: 'TOOL_CALL', id: 'first', delta: { command: 'old', discard: true } },
    { type: 'TOOL_CALL', id: 'first', delta: { command: 'echo ok' } },
    { type: 'TOOL_CALL_END', id: 'second' },
    { type: 'TOOL_CALL_END', id: 'first', input: { command: 'echo ok' } },
    { type: 'TOOL_RESPONSE', id: 'resp-1', tool_call_id: 'first', output: 'done', stdout: 'ok', returncode: 0, state: 'completed' },
    { type: 'TOOL_RESPONSE', id: 'orphan-cmd', tool_result_name: 'Bash', output: 'ignored' },
    { type: 'TOOL_RESPONSE', id: 'second-resp', tool_result_name: 'READ_FILE', output: 'file body' },
  ]);
  const result = reduceRound(createOrdinary(), events).state;
  assert.deepEqual(result.contentList.map(({ type }) => type), ['TOOL_CALL', 'TOOL_CALL', 'TOOL_RESPONSE']);
  assert.deepEqual(result.contentList[0].delta, { command: 'echo ok' });
  assert.deepEqual(result.contentList[0].input, { command: 'echo ok' });
  assert.equal(result.contentList[0].tool_call_name, 'BASH');
  assert.equal(result.contentList[0].output, 'done');
  assert.equal(result.contentList[0].stdout, 'ok');
  assert.equal(result.contentList[0].returncode, 0);
  assert.equal(result.contentList[0].state, 'completed');
  assert.equal(result.contentList[0].inputComplete, true);
  assert.equal(result.contentList[0].responseReceived, true);
  assert.equal(result.contentList[1].tool_call_name, 'mcp__read');
  assert.equal(result.contentList[2].output, 'file body');
  assert.deepEqual(result.lifecycle, {});
});

test('subagent command tools inherit lifecycle merging across same-name subagents', () => {
  const result = reduceRound(createOrdinary(), frames([
    { type: 'SUBAGENT_CREATE', id: 'agent-1', delta: { agent_name: 'Runner' } },
    { type: 'SUBAGENT_CREATE', id: 'agent-2', delta: { agent_name: 'Runner' } },
    { type: 'SUBAGENT_TOOL_CALL_START', id: 'cmd-1', name: 'Runner', tool_call_name: 'execute_python_code' },
    { type: 'SUBAGENT_TOOL_CALL_END', id: 'cmd-1', name: 'Runner', input: { code: 'print(1)' } },
    { type: 'SUBAGENT_TOOL_RESPONSE', id: 'resp-1', tool_call_id: 'cmd-1', name: 'Runner', output: '1', returncode: '0' },
  ])).state;
  const subContents = result.contentList[0].subAgentRenderConfig.subAgentContents;
  assert.equal(subContents['agent-1'].contentList.length, 1);
  assert.equal(subContents['agent-1'].contentList[0].tool_call_name, 'EXECUTE_PYTHON_CODE');
  assert.equal(subContents['agent-1'].contentList[0].inputComplete, true);
  assert.equal(subContents['agent-1'].contentList[0].responseReceived, true);
  assert.equal(subContents['agent-1'].contentList[0].output, '1');
  assert.equal(subContents['agent-1'].contentList[0].returncode, '0');
  assert.equal(subContents['agent-2'].contentList.length, 0);
});

test('metadata, question answers and browser intents stay independent of completion', () => {
  const values = [
    { type: 'OPEN_BROWSER', browserUrl: '/preview' },
    { type: 'CONTEXT_COMPRESSED' },
    { type: 'CONTEXT_COMPRESSING' },
    { type: 'CONTEXT_COMPRESSED_FAILED', message: 'Compression failed' },
    { type: 'CONTEXT_COMPRESSED' },
    { type: 'ASK_USER_QUESTION', id: 'question', question: ' Choose ', options: [{ id: 'one', text: 'One' }, {}] },
    { type: 'USAGE_INFO', usage: { usage_percentage: 35 } },
    { type: 'SIMULATE_QUESTIONS', outputs: [{ text: ' Follow up ' }, {}] },
    { type: 'REFERENCE', reference_id: 'ref', tool: 'news_search',
      content: [{ type: 'text', text: '{"results":[{"title":"Title"},{}]}' }] },
    { type: 'TASK_COMPLETED', status: 'success', duration_seconds: 1 },
    { type: 'CLOSE_BROWSER' },
  ];
  const events = frames(values);
  const before = reduceRound(createOrdinary(), events);
  assert.deepEqual(before.intents, [{ type: 'browser.open', url: '/preview' }, { type: 'browser.close' }]);
  assert.equal(before.state.pendingQuestion.question, 'Choose');
  assert.equal(before.state.contentList[0].contextCompressStatus, 'failed');
  assert.equal(before.state.contentList[0].message, 'Compression failed');
  assert.equal(before.state.usage.usage_percentage, 35);
  assert.deepEqual(before.state.suggestedQuestions, ['Follow up']);
  assert.deepEqual(before.state.referenceList[0].references, [{ title: 'Title' }]);
  const after = reduceRound(before.state, [
    { kind: 'user.answer', sourceId: 'question', optionId: 'one', userMessage: ' Yes ' },
    { kind: 'input.end', reason: 'closed' },
  ]).state;
  assert.deepEqual(after.contentList[1].userAnswer, { optionId: 'one', userMessage: 'Yes' });
  assert.equal(after.pendingQuestion, undefined);
  assert.equal(after.status, 'success');
  assert.equal(reduceRound(after, events).state, after);
  assert.deepEqual(reduceRound(createOrdinary(), frames(values, { source: 'history' })).intents, []);
});

test('malformed completion frames never claim the terminal state of an ordinary or OPC round', () => {
  const completed = { type: 'TASK_COMPLETED', status: 'success' };
  for (const kind of ['ordinary', 'opc']) {
    const initial = createRound({ roundKey: 'round', kind });
    for (const invalid of [{ type: 'TASK_COMPLETED' }, { type: 'TASK_COMPLETED', status: 'finished' }]) {
      assert.deepEqual(decodeFrame(invalid), {
        ok: false, issue: { code: 'invalid_frame', frameType: 'TASK_COMPLETED' },
      });
      const unchecked = { kind: 'frame', source: 'stream', frame: invalid };
      const [success] = frames([completed]);
      assert.equal(reduceRound(initial, [unchecked]).state, initial);
      assert.equal(reduceRound(initial, [unchecked, success, unchecked]).state.status, 'success');
    }
  }
});

test('a transport failure records an error only when it decides the terminal state', () => {
  const end = { kind: 'input.end', reason: 'failed', error: 'connection reset' };
  for (const kind of ['ordinary', 'opc']) {
    const initial = createRound({ roundKey: 'round', kind });
    const interrupted = reduceRound(initial, [end]).state;
    assert.equal(interrupted.status, 'error');
    assert.equal(interrupted.error, 'connection reset');
    const completed = reduceRound(initial, [...frames([{ type: 'TASK_COMPLETED', status: 'success' }]), end]).state;
    assert.equal(completed.status, 'success');
    assert.equal(completed.error, undefined);
  }
});

test('a history close frame clears the browser even in a round that did not open it', () => {
  const { state, intents } = reduceRound(createOrdinary(), frames([{ type: 'CLOSE_BROWSER' }], { source: 'history' }));
  assert.equal(state.browserClosed, true);
  assert.deepEqual(intents, []);
  const reopened = reduceRound(state, frames([{ type: 'OPEN_BROWSER', browserUrl: '/preview' }], { source: 'history' })).state;
  assert.equal(reopened.browserClosed, undefined);
  assert.equal(reopened.browserUrl, '/preview');
});

test('ordinary subagent legacy snapshots update the matching block across interleaved IDs', () => {
  const { state } = reduceRound(createOrdinary(), frames([
    { type: 'SUBAGENT_CREATE', id: 'agent', delta: { agent_name: 'Reader', agent_type: 'explore' } },
    { type: 'SUBAGENT_ASSISTANT_MSG', name: 'Reader', id: 'a', content: 'a' },
    { type: 'SUBAGENT_ASSISTANT_MSG', name: 'Reader', id: 'b', content: 'b' },
    { type: 'SUBAGENT_ASSISTANT_MSG', name: 'Reader', id: 'a', content: 'a final' },
  ]));
  const group = state.contentList[0].subAgentRenderConfig;
  assert.equal(group.subAgentList[0].agent_type, 'explore');
  assert.deepEqual(group.subAgentContents.agent.contentList.map((block) => block.content), ['a final', 'b']);
});

test('ordinary subagents stay grouped across interleaved main frames and own their tool scopes', () => {
  const result = reduceRound(createOrdinary(), frames([
    { type: 'SUBAGENT_CREATE', id: 'constructor', delta: { agent_name: 'Planner' } },
    { type: 'TOOL_CALL', id: 'same', tool_call_name: 'write' },
    { type: 'SUBAGENT_CREATE', id: 'reader', delta: { agent_name: 'Reader' } },
    { type: 'SUBAGENT_TOOL_CALL_START', id: 'same', name: 'Reader', tool_call_name: 'read' },
    { type: 'SUBAGENT_TOOL_CALL', id: 'same', name: 'Reader', delta: { path: 'example' } },
    { type: 'SUBAGENT_TOOL_CALL_END', id: 'same', name: 'Reader' },
  ], { source: 'history' })).state;
  assert.deepEqual(result.contentList.map(({ type }) => type), ['SUBAGENTS', 'TOOL_CALL']);
  const { subAgentList, subAgentContents } = result.contentList[0].subAgentRenderConfig;
  assert.deepEqual(subAgentList.map(({ id }) => id), ['constructor', 'reader']);
  assert.equal(subAgentContents.constructor.kind, 'ordinary');
  assert.deepEqual(subAgentContents.reader.contentList[0].delta, { path: 'example' });
  assert.equal(result.contentList[1].tool_call_name, 'WRITE');
});

test('a running subagent retains ownership of its block after a same-name subagent starts', () => {
  const values = [
    { type: 'SUBAGENT_CREATE', id: 'first', delta: { agent_name: 'Reader' } },
    { type: 'SUBAGENT_THINK_MSG_START', id: 'thought-a', name: 'Reader' },
    { type: 'SUBAGENT_CREATE', id: 'second', delta: { agent_name: 'Reader' } },
    { type: 'SUBAGENT_THINK_MSG_START', id: 'thought-b', name: 'Reader' },
    { type: 'SUBAGENT_THINK_MSG', id: 'thought-a', name: 'Reader', content: 'first answer' },
    { type: 'SUBAGENT_THINK_MSG_END', id: 'thought-a', name: 'Reader' },
    { type: 'SUBAGENT_THINK_MSG_END', id: 'thought-b', name: 'Reader', content: 'second answer' },
  ];
  for (const source of ['stream', 'history']) {
    const { state } = reduceRound(createOrdinary(), frames(values, { source }));
    const [first, second] = state.contentList.map(({ subAgentRenderConfig }) => subAgentRenderConfig.subAgentContents);
    assert.deepEqual(first.first.contentList.map(({ content }) => content), ['first answer']);
    assert.deepEqual(second.second.contentList.map(({ content }) => content), ['second answer']);
    assert.deepEqual(first.first.lifecycle, {});
    assert.deepEqual(second.second.lifecycle, {});
  }
});

test('decoder reports malformed frames and lets an explicit custom mapper preserve typed data', () => {
  assert.deepEqual(decodeFrame('bad'), { ok: false, issue: { code: 'invalid_json' } });
  assert.deepEqual(decodeFrame({ event: 'ASSISTANT_MSG' }), { ok: false, issue: { code: 'invalid_frame' } });
  assert.deepEqual(decodeFrame({ type: 'AUDIT' }), { ok: false, issue: { code: 'unknown_frame', frameType: 'AUDIT' } });
  const block = Object.freeze({ id: 'audit-1', type: 'AUDIT_NOTE', content: 'reviewed', auditId: 17 });
  const [event] = frames([{ type: 'AUDIT' }], { mapCustomFrame: () => ({ kind: 'content', block }) });
  const result = reduceRound(createOrdinary(), [event]).state;
  assert.equal(result.contentList[0], block);
  assert.equal(reduceRound(result, [event]).state, result);
  assert.equal(decodeFrame({ type: 'AUDIT' }, { mapCustomFrame: () => ({ kind: 'content', block: {} }) }).ok, false);
});

test('vendor fields are preserved without being interpreted as a subagent group', () => {
  const block = Object.freeze({
    id: 'vendor', type: 'VENDOR_NOTE', subAgentRenderConfig: Object.freeze({ vendor: true }),
  });
  const events = frames([
    { type: 'SUBAGENT_CREATE', id: 'worker', delta: { agent_name: 'Worker' } },
    { type: 'VENDOR_NOTE' },
    { type: 'SUBAGENT_ASSISTANT_MSG', name: 'Worker', content: 'answer' },
  ], { mapCustomFrame: () => ({ kind: 'content', block }) });
  const { state } = reduceRound(createOrdinary(), [...events, { kind: 'input.end', reason: 'closed' }]);
  assert.equal(state.contentList[0].subAgentRenderConfig.subAgentContents.worker.contentList[0].content, 'answer');
  assert.equal(state.contentList[1], block);
});

test('subagent creation lifecycle frames decode as known and do not pollute inner content', () => {
  const raw = [
    { type: 'SUBAGENT_CREATE_START', id: 's1', name: 'FinWork', tool_call_name: 'create_subagent' },
    { type: 'SUBAGENT_CREATE', id: 's1', name: 'FinWork', delta: { agent_name: 'FinWork' } },
    { type: 'SUBAGENT_CREATE_END', id: 's1', name: 'FinWork', tool_call_name: 'create_subagent' },
    { type: 'SUBAGENT_ASSISTANT_MSG_END', id: 'm1', name: 'FinWork', content: 'done' },
  ];
  for (const source of ['stream', 'history']) {
    const { state } = reduceRound(createOrdinary(), [...frames(raw, { source }), { kind: 'input.end', reason: 'closed' }]);
    const group = state.contentList[0].subAgentRenderConfig;
    assert.deepEqual(group.subAgentList.map(({ id, name }) => [id, name]), [['s1', 'FinWork']]);
    assert.deepEqual(group.subAgentContents.s1.contentList.map(({ content }) => content), ['done']);
  }
});
