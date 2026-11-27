import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCore } from './helpers/load-core.mjs';

const {
  createRound, decodeFrame, groupOpcTimeline, isOpcBlockStreaming, reduceRound, resolveOpcExecution,
} = await loadCore('core-sse');
const createOpc = () => createRound({ roundKey: 'round', kind: 'opc' });
const frame = (type, fields = {}, runId = 'run') => ({ type, opc: { run_id: runId }, ...fields });
const member = (type, replyId, role, fields = {}, agentId = role) => frame(type, {
  reply_id: replyId,
  opc: { run_id: 'run', agent_role: role, agent_id: agentId },
  ...fields,
});
const assign = (id, prompt) => member('TOOL_CALL_END', 'leader', 'leader', {
  id, tool_call_name: 'TeamAssign', input: { member: 'worker', prompt },
});
const decode = (raw) => raw.map((item) => {
  const decoded = decodeFrame(item);
  assert.equal(decoded.ok, true, item.type);
  return decoded.event;
});
const apply = (previous, ...raw) => reduceRound(previous, decode(raw)).state;

test('OPC keeps repeated dispatches and reports for the same expert distinct', () => {
  const initial = Object.freeze(createOpc());
  const directed = apply(initial,
    member('OPC_AGENT_REPLY_START', 'leader', 'leader'),
    assign('a', 'first'),
    assign('b', 'second'),
  );
  const groupedDirected = groupOpcTimeline(directed);
  assert.equal(groupedDirected[0].kind, 'leader');
  assert.equal(groupedDirected[0].content.length, 2);
  const dispatch = groupedDirected[1];
  assert.equal(dispatch.kind, 'dispatch');
  assert.equal(dispatch.reply?.id, 'leader');
  const [a, b] = dispatch.assignmentIds;
  const linked = apply(directed,
    member('OPC_AGENT_REPLY_START', '__proto__', 'worker', { created_at: '2026-11-22T13:23:00.123456' }),
    member('OPC_AGENT_REPLY_START', 'worker-2', 'worker'),
    member('WORKER_ASSISTANT_MSG', '__proto__', 'worker', { id: 'shared', content: 'first result' }),
    member('WORKER_ASSISTANT_MSG_END', 'worker-2', 'worker', { id: 'shared', content: 'second result' }),
    member('OPC_AGENT_REPLY_END', 'worker-2', 'worker', { status: 'completed' }),
    member('OPC_AGENT_REPLY_END', '__proto__', 'worker', { status: 'completed', created_at: '2026-11-22T13:23:02.623456' }),
    member('TOOL_RESPONSE', 'leader', 'leader', { id: 'b', output: 'submitted second', state: 'success' }),
  );
  assert.equal(directed.assignments[a].replyId, undefined);
  assert.deepEqual(
    linked.timeline.filter((entry) => entry.kind === 'report').map((entry) => entry.replyId),
    ['__proto__', 'worker-2'],
  );
  const first = resolveOpcExecution(linked, { kind: 'assignment', id: a });
  const second = resolveOpcExecution(linked, { kind: 'reply', id: 'worker-2' });
  assert.equal(first.reply.id, '__proto__');
  assert.equal(first.reply.durationMs, 2500);
  assert.equal(first.reply.blocks[0].streaming, false);
  assert.equal(first.reply.blocks[0].content, 'first result');
  assert.notEqual(first.reply.blocks[0].id, second.reply.blocks[0].id);
  assert.equal(second.assignment.id, b);
  assert.equal(second.assignment.result.text, 'submitted second');
  assert.equal(resolveOpcExecution(linked, { kind: 'reply', id: 'toString' }), undefined);
});

test('OPC late result after the leader reply ends is identical across batch boundaries', () => {
  const raw = [
    member('OPC_AGENT_REPLY_START', 'leader', 'leader'),
    member('ASSISTANT_MSG', 'leader', 'leader', { id: 'text', content: 'draft' }),
    assign('a', 'review'),
    member('OPC_AGENT_REPLY_END', 'leader', 'leader', { status: 'completed' }),
    frame('TASK_COMPLETED', { status: 'success', duration_seconds: 2 }),
    member('TOOL_RESPONSE', 'leader', 'leader', { id: 'a', state: 'success', output: 'reviewed' }),
  ];
  const events = decode(raw);
  const end = { kind: 'input.end', reason: 'closed' };
  const batch = reduceRound(createOpc(), [...events, end]).state;
  const split = [...events, end].reduce((state, event) => reduceRound(state, [event]).state, createOpc());
  assert.deepEqual(batch, split);
  assert.equal(batch.replies.leader.blocks[0].streaming, false);
  assert.equal(batch.replies.leader.blocks[1].output, 'reviewed');
  assert.equal(batch.completion.status, 'success');
  assert.equal(batch.inputEnded, true);
});

test('OPC text prefers snapshots and ignores competing runs and duplicate lifecycle frames', () => {
  const before = apply(createOpc(),
    member('OPC_AGENT_REPLY_START', 'leader', 'leader'),
    member('ASSISTANT_MSG_START', 'leader', 'leader', { id: 'text' }),
    member('ASSISTANT_MSG', 'leader', 'leader', { id: 'text', text_delta: 'first' }),
    member('ASSISTANT_MSG', 'leader', 'leader', { id: 'text', text_delta: ' ' }),
  );
  assert.equal(before.replies.leader.blocks[0].content, 'first ');
  const after = apply(before,
    member('ASSISTANT_MSG_END', 'leader', 'leader', { id: 'text', content: 'complete', text_delta: 'ignored' }),
  );
  assert.equal(after.replies.leader.blocks[0].content, 'complete');
  assert.equal(after.timeline, before.timeline);
  assert.equal(after.assignments, before.assignments);
  assert.equal(before.replies.leader.blocks[0].content, 'first ');
  assert.equal(apply(after,
    frame('TASK_COMPLETED', { status: 'error' }, 'stale'),
    member('ASSISTANT_MSG_START', 'leader', 'leader', { id: 'text' }),
    member('OPC_AGENT_REPLY_START', 'leader', 'leader'),
  ), after);
});

test('OPC closes an interrupted input without creating a blank worker report', () => {
  const team = apply(createOpc(),
    member('OPC_AGENT_REPLY_START', 'worker-1', 'worker'),
    member('WORKER_ASSISTANT_MSG', 'worker-1', 'worker', { id: 'pending', content: '   ' }),
  );
  assert.equal(team.timeline.length, 0);
  const stopped = reduceRound(team, [{ kind: 'input.end', reason: 'cancelled' }]).state;
  assert.equal(stopped.status, 'cancelled');
  assert.equal(stopped.replies['worker-1'].status, 'cancelled');
  assert.equal(stopped.replies['worker-1'].blocks[0].streaming, false);
  assert.equal(stopped.timeline, team.timeline);
  assert.equal(stopped.completion, undefined);
  assert.equal(apply(stopped, frame('TASK_COMPLETED', { status: 'success' })), stopped);
});

test('OPC separates delta/input, matches TEAMASSIGN case-insensitively, merges tool_call_id responses and groups leader blocks', () => {
  const state = apply(createOpc(),
    member('OPC_AGENT_REPLY_START', 'leader', 'leader', { name: '团长' }),
    member('THINK_MSG_END', 'leader', 'leader', { id: 't1', content: '先分析' }),
    member('TOOL_CALL_START', 'leader', 'leader', { id: 'cmd1', tool_call_name: 'bash' }),
    member('TOOL_CALL', 'leader', 'leader', { id: 'cmd1', delta: { command: 'ls' } }),
    member('TOOL_CALL_END', 'leader', 'leader', { id: 'cmd1', input: { command: 'ls -la' } }),
    member('TOOL_RESPONSE', 'leader', 'leader', { id: 'resp-cmd1', tool_call_id: 'cmd1', output: 'ok', stdout: 'a.txt', returncode: 0 }),
    member('ASSISTANT_MSG_END', 'leader', 'leader', { id: 'a1', content: '准备派发' }),
    member('TOOL_CALL_END', 'leader', 'leader', { id: 'd1', tool_call_name: 'TEAMASSIGN', input: { member: 'worker', prompt: '执行' } }),
    member('TOOL_CALL_END', 'leader', 'leader', { id: 't2', tool_call_name: 'READ_FILE', input: { file_path: 'b.txt' }, state: 'success' }),
    member('ASSISTANT_MSG_END', 'leader', 'leader', { id: 'a2', content: '汇总结果' }),
    member('ASSISTANT_MSG_END', 'leader', 'leader', { id: 'blank', content: '   ' }),
  );

  const cmdBlock = state.replies.leader.blocks.find((block) => block.sourceId === 'cmd1');
  assert.deepEqual(cmdBlock.delta, { command: 'ls' });
  assert.deepEqual(cmdBlock.input, { command: 'ls -la' });
  assert.equal(cmdBlock.inputEnded, true);
  assert.equal(cmdBlock.inputComplete, true);
  assert.equal(cmdBlock.responseReceived, true);
  assert.equal(cmdBlock.stdout, 'a.txt');
  assert.equal(cmdBlock.returncode, 0);
  assert.equal(isOpcBlockStreaming(cmdBlock), false);

  const assignBlock = state.replies.leader.blocks.find((block) => block.sourceId === 'd1');
  assert.equal(assignBlock.state, 'success');
  assert.equal(Object.keys(state.assignments).length, 1);

  const grouped = groupOpcTimeline(state);
  assert.deepEqual(grouped.map((entry) => entry.kind), ['leader', 'dispatch', 'leader']);
  assert.equal(grouped[0].content.length, 4);
  assert.equal(grouped[1].reply?.id, 'leader');
  assert.equal(grouped[2].content.length, 2);
  assert.equal(grouped[2].content[1].content, '汇总结果');
});

test('OPC applies the last valid completion frame, ignores invalid ones, and preserves state on identical repeats', () => {
  const uncompleted = frame('TASK_COMPLETED', { status: 'uncompleted', message: 'waiting' });
  const success = frame('TASK_COMPLETED', { status: 'success', duration_seconds: 3 });
  const first = apply(createOpc(), uncompleted);
  assert.equal(first.status, 'uncompleted');
  assert.equal(first.completion?.message, 'waiting');

  const second = apply(first, success);
  assert.equal(second.status, 'success');
  assert.equal(second.completion?.status, 'success');
  assert.equal(second.completion?.durationSeconds, 3);
  assert.equal(apply(second, success), second);

  const invalid = { kind: 'frame', source: 'stream', frame: { type: 'TASK_COMPLETED', status: 'bogus' } };
  assert.equal(reduceRound(second, [invalid]).state, second);

  const reversed = apply(second, uncompleted);
  assert.equal(reversed.status, 'uncompleted');

  const withReply = apply(first, member('OPC_AGENT_REPLY_START', 'worker-late', 'worker'));
  assert.ok(withReply.replies['worker-late']);
});
