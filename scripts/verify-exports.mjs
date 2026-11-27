import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

for (const [name, target] of Object.entries(manifest.exports)) {
  for (const file of typeof target === 'string' ? [target] : Object.values(target)) {
    assert.ok(existsSync(resolve(root, file)), name + ' is missing ' + file);
  }
}

const { testCoreSse } = await import('@lz19.02/finwork-kit/chat/core-sse');
const { testCoreDetail } = await import('@lz19.02/finwork-kit/chat/core-detail');
const ui = await import('@lz19.02/finwork-kit/chat/ui');
for (const name of [
  'MessageItem', 'UserMessage', 'AiMessage', 'SystemMessage', 'MessageContentList',
  'MessageContentItem', 'MessageCollapse', 'ThinkContent', 'AssistantContent',
  'ToolCallMsg', 'ToolCallResponse', 'ToolExecutionCard', 'ContextCompressContent', 'AskUserQuestionContent',
  'TaskCompletedSplit', 'MultiSubAgentCard', 'SubAgentListItem', 'MessageActions',
  'SuggestedQuestions', 'ChatCompletedResult', 'MessageFileCard', 'MessageFileList',
  'SkillOutputCard', 'OutputFilesCollapse',
  'MarkdownViewer', 'StreamingMarkdownRenderer', 'StreamingTextRenderer', 'MarkdownCodeBlock',
  'CodeViewer', 'ReferenceAnchor',
  'OpcAnswer', 'OpcRound', 'OpcTimeline', 'OpcExpertPanel', 'OpcAvatar', 'OpcStatus',
]) assert.ok(ui[name], 'Missing UI export: ' + name);
assert.equal(testCoreSse(), 'core-sse:ok');
assert.equal(testCoreDetail(), 'core-detail:ok');
for (const name of ['ChatExample', 'FeedbackForm', 'FeedbackModal']) assert.equal(ui[name], undefined);
assert.match(renderToStaticMarkup(createElement(ui.AiMessage, { title: 'Consumer UI' })), /Consumer UI/);
const css = readFileSync(join(root, 'dist/chat-ui.css'), 'utf8');
assert.match(css, /--finwork-primary-color/);
assert.doesNotMatch(css, /\.ant-btn|:root|#1890ff|#a30030/i);
assert.doesNotMatch(readFileSync(join(root, 'dist/chat/ui.js'), 'utf8'), /\.css["']|createElement\(["']style["']\)/);

const isolated = mkdtempSync(join(tmpdir(), 'finwork-kit-core-'));
try {
  cpSync(join(root, 'dist'), join(isolated, 'dist'), { recursive: true });
  writeFileSync(join(isolated, 'package.json'), JSON.stringify(manifest));
  const sse = pathToFileURL(join(isolated, 'dist/chat/core-sse.js')).href;
  const detail = pathToFileURL(join(isolated, 'dist/chat/core-detail.js')).href;
  const check = [
    "import assert from 'node:assert/strict';",
    'import { testCoreSse, decodeFrame, createRound, reduceRound, reduceStreamBatch, resolveOpcExecution, getCommandToolName, isOpcBlockStreaming, groupOpcTimeline } from ' + JSON.stringify(sse) + ';',
    'import { testCoreDetail, parseDetailFrames, replayTaskRecords } from ' + JSON.stringify(detail) + ';',
    "assert.equal(testCoreSse(), 'core-sse:ok');",
    "assert.equal(testCoreDetail(), 'core-detail:ok');",
    "assert.equal(getCommandToolName('bash'), 'BASH');",
    "assert.equal(isOpcBlockStreaming({ id: 'b', type: 'TOOL_CALL', sourceId: 's' }), true);",
    "assert.deepEqual(groupOpcTimeline(createRound({ roundKey: 'g', kind: 'opc' })), []);",
    "const frame = { type: 'ASSISTANT_MSG_END', id: 'a', content: 'SDK output' };",
    "const decoded = decodeFrame(JSON.stringify(frame));",
    "assert.ok(decoded.ok);",
    "const live = reduceRound(createRound({ roundKey: 'r', kind: 'ordinary' }), [decoded.event]).state;",
    "const answer = '<data>' + JSON.stringify(frame) + '</data>';",
    "assert.equal(parseDetailFrames(answer).frames.length, 1);",
    "const history = replayTaskRecords([{ chatId: 'r', question: 'Q', answer }]);",
    "assert.deepEqual(history.issues, []);",
    "assert.equal(live.contentList[0].content, 'SDK output');",
    "const target = { taskId: 'task', answerId: 'r', state: createRound({ roundKey: 'r', kind: 'ordinary' }) };",
    "assert.deepEqual(reduceStreamBatch([target], [{ taskId: 'task', answerId: 'r', data: frame }]).updates[0].state, live);",
    "assert.equal(history.rounds[0].state.contentList[0].content, 'SDK output');",
    "assert.equal(resolveOpcExecution(createRound({ roundKey: 't', kind: 'opc' }), { kind: 'reply', id: 'missing' }), undefined);",
    "assert.equal(typeof document, 'undefined');",
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', check], {
    cwd: isolated,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
} finally {
  rmSync(isolated, { recursive: true, force: true });
}

console.log('Exports, declarations, core isolation, CSS and static UI rendering passed.');
