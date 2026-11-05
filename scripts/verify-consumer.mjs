import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'finwork-kit-consumer-'));
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
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(consumer, 'build-' + mode),
      minify: false,
      lib: { entry: join(consumer, 'ui.tsx'), formats: ['es'], fileName: 'consumer' },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  assert.ok(output.some((file) => file.type === 'chunk' && file.isEntry), mode + ': missing UI bundle');
  assert.ok(output.some((file) => file.type === 'asset' && file.fileName.endsWith('.css') && file.source.length > 0), mode + ': missing CSS');
  console.log(mode + ': public types, SSR, CSS and Vite consumer build passed.');
}

try {
  assert.ok(existsSync(join(root, 'dist/chat/ui.js')), 'Run pnpm build:lib before pnpm verify:consumer.');
  mkdirSync(consumer);
  write('package.json', {
    name: 'finwork-kit-consumer', private: true, type: 'module',
    dependencies: { react: manifest.devDependencies.react, 'react-dom': manifest.devDependencies['react-dom'] },
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
  write('core.ts', `import { testCoreSse } from '${manifest.name}/chat/core-sse';
import { testCoreDetail } from '${manifest.name}/chat/core-detail';
const sse: string = testCoreSse();
const detail: string = testCoreDetail();
// @ts-expect-error The public return type must not become any.
const invalid: number = testCoreSse();
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
  write('ui.tsx', `import { createRoot } from 'react-dom/client';
import {
  AiMessage, MessageContentList, MessageContentItem, ThinkContent, MessageActions,
  MessageFileCard, SubAgentListItem, MarkdownViewer, StreamingMarkdownRenderer, AssistantContent,
  type AiMessageProps, type MessageContent,
  type MessageContentRenderers,
} from '${manifest.name}/chat/ui';
import '${manifest.name}/chat/style.css';
const props: AiMessageProps = { title: 'Consumer UI' };
// @ts-expect-error Invalid props must fail through published declarations.
const invalid: AiMessageProps = { connecting: 'yes' };
interface BusinessContent extends MessageContent { auditId: string }
const list: BusinessContent[] = [{ id: 'a', type: 'CUSTOM', auditId: 'audit' }];
const renderers: MessageContentRenderers<BusinessContent> = {
  CUSTOM: ({ item }) => <ThinkContent content={item.auditId} />,
};
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
</>);
// @ts-expect-error Business renderer props retain their actual field types.
const invalidRenderers: MessageContentRenderers<BusinessContent> = { CUSTOM: ({ item }) => item.auditId.toFixed() };
`);
  write('ui.mjs', `import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiMessage, MessageContentList, MessageFileCard, MessageActions, AssistantContent } from '${manifest.name}/chat/ui';
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
`);
  await verifyUI('tarball');

  for (const dependency of ['react', 'react-dom', '@types/react', '@types/react-dom']) {
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
