import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'finwork-kit-consumer-')));
const consumer = join(workspace, 'consumer');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const npmOptions = ['--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', process.env.npm_config_cache || join(tmpdir(), 'finwork-kit-npm-cache')];

function run(command, args, cwd = consumer) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, command + ' ' + args.join(' ') + '\n' + (result.error?.message ?? '') + result.stdout + result.stderr);
  return result.stdout;
}

function write(name, content) {
  writeFileSync(join(consumer, name), typeof content === 'string' ? content : JSON.stringify(content));
}

function typecheck(config) {
  run(process.execPath, [join(root, 'node_modules/typescript/lib/tsc.js'), '-p', config]);
}

async function verifyUI(mode) {
  typecheck('tsconfig.json');
  run(process.execPath, ['ui.mjs']);
  const result = await build({
    configFile: false,
    root: consumer,
    logLevel: 'warn',
    resolve: { dedupe: ['react', 'react-dom', 'antd', '@ant-design/icons'] },
    build: {
      outDir: join(consumer, 'build-' + mode),
      minify: false,
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  assert.ok(output.some((file) => file.type === 'chunk' && file.isEntry), mode + ': missing UI bundle');
  assert.ok(output.some((file) => file.type === 'asset' && file.fileName.endsWith('.css') && file.source.length > 0), mode + ': missing CSS');
  const page = output.find((file) => file.fileName === 'index.html');
  const kitStyle = output.find((file) => file.type === 'asset' && file.fileName.endsWith('.css') && String(file.source).includes('--finwork-primary-color'));
  assert.ok(page && kitStyle && String(page.source).includes(kitStyle.fileName), mode + ': Kit CSS must load from the initial HTML before lazy UI');
  console.log(mode + ': public types, SSR, CSS and Vite consumer build passed.');
}

try {
  assert.ok(existsSync(join(root, 'dist/chat/ui.js')), 'Run pnpm build:lib before pnpm verify:consumer.');
  mkdirSync(consumer);
  write('package.json', {
    name: 'finwork-kit-consumer', private: true, type: 'module',
    dependencies: Object.fromEntries(Object.keys(manifest.peerDependencies).map((name) => [name, manifest.devDependencies[name]])),
    devDependencies: { '@types/react': manifest.devDependencies['@types/react'], '@types/react-dom': manifest.devDependencies['@types/react-dom'] },
  });
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', workspace, ...npmOptions], root));
  assert.ok(packed.files.length > 0, 'Empty npm tarball');
  for (const { path } of packed.files) {
    assert.match(path, /^(dist\/|package\.json$|readme(?:\.[^/]+)?$|licen[cs]e(?:\.[^/]+)?$)/i, 'Unexpected tarball file: ' + path);
  }
  run('npm', ['install', join(workspace, packed.filename), '--package-lock=false', ...npmOptions]);
  for (const dependency of Object.keys(manifest.dependencies)) {
    assert.ok(existsSync(join(consumer, 'node_modules', dependency)), 'Kit must install its runtime dependency: ' + dependency);
  }

  write('tsconfig.core.json', {
    compilerOptions: {
      target: 'ES2020', lib: ['ES2020'], module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, types: [],
    },
    include: ['core.ts'],
  });
  write('core.ts', `import { createRound, decodeFrame, reduceRound, reduceStreamBatch, testCoreSse, type DecodeFrameOptions } from '${manifest.name}/chat/core-sse';
import { replayTaskRecords, testCoreDetail } from '${manifest.name}/chat/core-detail';
const sse: string = testCoreSse();
const detail: string = testCoreDetail();
// @ts-expect-error The public return type must not become any.
const invalid: number = testCoreSse();
type AuditBlock = { id: string; type: 'AUDIT_NOTE'; auditId: string };
const options: DecodeFrameOptions<AuditBlock> = {
  mapCustomFrame: () => ({ kind: 'content', block: { id: 'note', type: 'AUDIT_NOTE', auditId: 'audit' } }),
};
const decoded = decodeFrame({ type: 'AUDIT_NOTE' }, options);
if (decoded.ok) {
  const { state } = reduceRound(createRound<AuditBlock>({ roundKey: 'r', kind: 'ordinary' }), [decoded.event]);
  for (const block of state.contentList) if ('auditId' in block) block.auditId.toUpperCase();
}
const replay = replayTaskRecords([{ chatId: 'r', question: 'Q', files: [{ fileName: 'file', tag: 'custom' }] }], options);
replay.rounds[0].files[0].tag.toUpperCase();
const batch = reduceStreamBatch(
  [{ taskId: 'task', answerId: 'r', state: createRound<AuditBlock>({ roundKey: 'r', kind: 'ordinary' }) }],
  [{ taskId: 'task', answerId: 'r', data: { type: 'AUDIT_NOTE' } }],
  options,
);
for (const { state } of batch.updates) {
  if (state.kind === 'ordinary') {
    for (const block of state.contentList) if ('auditId' in block) block.auditId.toUpperCase();
  }
}
`);
  write('core.mjs', `import assert from 'node:assert/strict';
import { testCoreSse } from '${manifest.name}/chat/core-sse';
import { testCoreDetail } from '${manifest.name}/chat/core-detail';
assert.equal(testCoreSse(), 'core-sse:ok');
assert.equal(testCoreDetail(), 'core-detail:ok');
assert.equal(typeof document, 'undefined');
`);
  typecheck('tsconfig.core.json');
  run(process.execPath, ['core.mjs']);
  console.log('Tarball whitelist, automatic UI dependencies and pure core runtime/types passed.');
  write('tsconfig.json', {
    extends: './tsconfig.core.json',
    compilerOptions: {
      lib: ['ES2020', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx',
      module: 'ESNext', moduleResolution: 'Bundler',
    },
    include: ['core.ts', 'ui.tsx'],
  });
  write('index.html', '<div id="root"></div><script type="module" src="/bootstrap.ts"></script>');
  write('bootstrap.ts', `import 'antd/dist/antd.css';
import '${manifest.name}/chat/style.css';
void import('./ui.tsx');
`);
  write('ui.tsx', `import { createRoot } from 'react-dom/client';
import {
  AiMessage, MessageContentList, MessageContentItem, ThinkContent, MessageActions,
  MessageFileCard, SubAgentListItem, MarkdownViewer, StreamingMarkdownRenderer, AssistantContent,
  type AiMessageProps, type MessageContent,
  type MessageContentRenderers, MessageItem, OpcAnswer, OpcExpertPanel, type OpcExecutionTarget,
} from '${manifest.name}/chat/ui';
const props: AiMessageProps = { title: 'Consumer UI' };
// @ts-expect-error Invalid props must fail through published declarations.
const invalid: AiMessageProps = { connecting: 'yes' };
interface BusinessContent extends MessageContent { auditId: string }
const list: BusinessContent[] = [{ id: 'a', type: 'CUSTOM', auditId: 'audit' }];
const renderers: MessageContentRenderers<BusinessContent> = {
  CUSTOM: ({ item }) => <ThinkContent content={item.auditId} />,
};
const target: OpcExecutionTarget = { kind: 'reply', id: 'reply-to-review' };
createRoot(document.createElement('div')).render(<>
  <AiMessage {...props} />
  <MarkdownViewer content="**Markdown**" />
  <StreamingMarkdownRenderer content="**Streaming**" isStreaming={false} />
  <AssistantContent content="custom" renderContent={(content, streaming) => <b>{content}{String(streaming)}</b>} />
  <MessageContentItem item={list[0]} renderers={renderers} />
  <MessageContentList list={list} renderers={renderers} renderItem={({ item }, content) => <section data-audit={item.auditId}>{content}</section>} />
  <MessageFileCard file={{ fileName: 'file', auditId: 'audit' }} onPreview={(file) => file.auditId.toUpperCase()} />
  <SubAgentListItem subagent={{ id: 'agent', auditId: 'audit' }} onSelect={(agent) => agent.auditId.toUpperCase()} />
  <MessageActions actions={[{ key: 'feedback', label: '反馈', onClick() {} }]} />
  <MessageItem role="opc_assistant">
    <OpcAnswer timeline={[{ id: 'report', kind: 'report', name: '专家', status: { status: 'completed', label: '完成' }, target }]} />
  </MessageItem>
  <OpcExpertPanel members={[]} tasks={[]} onMemberChange={() => {}} onTaskChange={() => {}} />
</>);
// @ts-expect-error Business renderer props retain their actual field types.
const invalidRenderers: MessageContentRenderers<BusinessContent> = { CUSTOM: ({ item }) => item.auditId.toFixed() };
`);
  write('ui.mjs', `import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfigProvider } from 'antd';
import { AiMessage, MessageContentList, MessageFileCard, MessageActions, AssistantContent, SuggestedQuestions, MessageItem, OpcAnswer } from '${manifest.name}/chat/ui';
import { replayTaskRecords } from '${manifest.name}/chat/core-detail';
const html = renderToStaticMarkup(createElement(AiMessage, { title: '<Consumer UI>' }));
assert.match(html, /&lt;Consumer UI&gt;/);
assert.match(renderToStaticMarkup(createElement(AiMessage)), /FinWork/);
assert.ok(renderToStaticMarkup(createElement(MessageContentList, {
  list: [{ id: 'custom', type: 'CUSTOM', auditId: 'business' }],
  renderers: { CUSTOM: ({ item }) => createElement('b', null, item.auditId) },
})).includes('<b>business</b>'));
assert.match(renderToStaticMarkup(createElement(MessageFileCard, { file: { fileName: 'consumer.txt' } })), /consumer.txt/);
assert.match(renderToStaticMarkup(createElement(MessageActions, { actions: [{ key: 'feedback', label: '反馈', onClick() {} }] })), /反馈/);
assert.match(renderToStaticMarkup(createElement(AssistantContent, { content: '**Markdown**' })), /<strong>Markdown/);
const replay = (kind, frames) => replayTaskRecords([{
  chatId: 'review', question: 'Review',
  answer: frames.map((frame) => '<data>' + JSON.stringify(frame) + '</data>').join(''),
}], { kind }).rounds[0].state;
const ordinary = replay('ordinary', [{ type: 'ASSISTANT_MSG', content: '**SDK answer**' }]);
assert.match(renderToStaticMarkup(createElement(MessageContentList, { list: ordinary.contentList })), /<strong>SDK answer/);
const leader = { reply_id: 'leader-reply', opc: { run_id: 'run', agent_id: 'leader', agent_role: 'leader' } };
const opc = replay('opc', [
  { ...leader, type: 'OPC_AGENT_REPLY_START', name: 'Leader' },
  { ...leader, type: 'ASSISTANT_MSG_END', id: 'answer', content: 'SDK summary' },
]);
const timeline = opc.timeline.map(({ kind, replyId, blockId }) => {
  const reply = opc.replies[replyId];
  return { id: blockId, kind, name: reply.name, content: reply.blocks.find((block) => block.id === blockId).content };
});
const opcMarkup = renderToStaticMarkup(createElement(MessageItem, { role: 'opc_assistant' },
  createElement(OpcAnswer, { timeline })));
assert.match(opcMarkup, /data-message-role="opc_assistant".*SDK summary/);
const inherited = renderToStaticMarkup(createElement(ConfigProvider, { prefixCls: 'host', componentSize: 'large', direction: 'rtl' },
  createElement(SuggestedQuestions, { questions: ['Host config'], onSelect() {} })));
assert.match(inherited, /host-btn-lg/);
assert.match(inherited, /host-btn-rtl/);
assert.doesNotMatch(inherited, /ant-btn/);
`);
  await verifyUI('tarball');

  for (const dependency of [...Object.keys(manifest.peerDependencies), '@types/react', '@types/react-dom']) {
    const target = join(consumer, 'node_modules', dependency);
    rmSync(target, { recursive: true, force: true });
    symlinkSync(realpathSync(join(root, 'node_modules', dependency)), target, 'dir');
  }

  const packageDirectory = join(consumer, 'node_modules', manifest.name);
  rmSync(packageDirectory, { recursive: true, force: true });
  symlinkSync(root, packageDirectory, 'dir');
  typecheck('tsconfig.core.json');
  run(process.execPath, ['core.mjs']);
  await verifyUI('symlink');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
