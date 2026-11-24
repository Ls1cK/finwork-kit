import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCore } from './helpers/load-core.mjs';

const { createRound, decodeFrame, reduceRound, resolveOpcExecution } = await loadCore('core-sse');
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
  const [dispatch] = directed.timeline;
  assert.equal(dispatch.kind, 'dispatch');
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
  assert.equal(linked.timeline[0], dispatch);
  assert.deepEqual(linked.timeline.slice(1).map((entry) => entry.replyId), ['worker-2', '__proto__']);
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

test('OPC closes an interrupted input without creating a worker report', () => {
  const team = apply(createOpc(),
    member('OPC_AGENT_REPLY_START', 'worker-1', 'worker'),
    member('WORKER_ASSISTANT_MSG', 'worker-1', 'worker', { id: 'pending', content: 'partial' }),
  );
  const stopped = reduceRound(team, [{ kind: 'input.end', reason: 'cancelled' }]).state;
  assert.equal(stopped.status, 'cancelled');
  assert.equal(stopped.replies['worker-1'].status, 'cancelled');
  assert.equal(stopped.replies['worker-1'].blocks[0].streaming, false);
  assert.equal(stopped.timeline, team.timeline);
  assert.equal(stopped.completion, undefined);
  assert.equal(apply(stopped, frame('TASK_COMPLETED', { status: 'success' })), stopped);
});
