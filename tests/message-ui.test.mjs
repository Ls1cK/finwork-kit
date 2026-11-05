import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { build } from 'vite';
import { Window } from 'happy-dom';
import less from 'less';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'finwork-kit-ui-'));
after(() => rmSync(workspace, { recursive: true, force: true }));
symlinkSync(join(rootDirectory, 'node_modules'), join(workspace, 'node_modules'), 'dir');
await build({
  configFile: false, root: rootDirectory, logLevel: 'warn',
  build: {
    outDir: join(workspace, 'dist'), emptyOutDir: true,
    lib: { entry: join(rootDirectory, 'src/chat/ui/index.ts'), formats: ['es'], fileName: () => 'ui.mjs' },
    rollupOptions: { external: (id) => /^(react|react-dom|antd|@ant-design\/icons|ahooks|highlight\.js|highlightjs-vue|markdown-to-jsx|yaml)(\/|$)/.test(id) },
  },
});
const ui = await import(pathToFileURL(join(workspace, 'dist/ui.mjs')).href);
const html = (component, props) => renderToStaticMarkup(h(component, props));

test('document and demo headings follow the light and dark site palette', async () => {
  const { css } = await less.render(readFileSync(join(rootDirectory, 'docs/styles/site.less'), 'utf8'));
  const window = new Window();
  try {
    window.document.body.innerHTML = '<main class="dumi-default-doc-layout"><article class="markdown"><h1>Title</h1><section><h2>Section</h2></section></article><div class="dumi-default-previewer-demo"><h3>Demo</h3></div></main>';
    const style = window.document.createElement('style');
    style.textContent = 'h1,h2,h3 { color: rgba(0,0,0,.85); }\n' + css;
    window.document.head.append(style);
    for (const [theme, expected] of [['light', '#20242c'], ['dark', '#edf0f4']]) {
      window.document.documentElement.setAttribute('data-prefers-color', theme);
      for (const heading of window.document.querySelectorAll('h1,h2,h3')) {
        assert.equal(window.getComputedStyle(heading).color, expected);
      }
    }
  } finally {
    await window.happyDOM.close();
  }
});

test('subagent status keeps its color and flex layout inside Ant Design buttons', () => {
  const finished = html(ui.SubAgentListItem, { subagent: { id: 'done' } });
  assert.match(finished, /aria-label="任务结束"/);
  assert.match(finished, /任务结束<\/span>/);
  assert.match(finished, /<button[^>]*class="[^"]*ant-btn[^"]*_subAgent_/);
  assert.doesNotMatch(finished, /ant-popover-disabled-compatible-wrapper/);
  assert.match(finished, /background-color:#a30030/);
  assert.match(finished, /fill="#a30030"/);
  const custom = html(ui.SubAgentListItem, { subagent: { id: 'custom' }, color: '#1890ff' });
  assert.match(custom, /background-color:#1890ff/);
  assert.match(custom, /fill="#1890ff"/);
  for (const subagent of [{ id: 'creating', creating: true }, { id: 'running', excuting: true }]) {
    assert.doesNotMatch(html(ui.SubAgentListItem, { subagent }), /任务结束/);
  }
  const cssName = readdirSync(join(workspace, 'dist')).find((name) => name.endsWith('.css'));
  const css = readFileSync(join(workspace, 'dist', cssName), 'utf8');
  assert.match(css, /\.[\w-]+>\.[\w-]+\{display:inline-flex;flex-shrink:0;align-items:center;gap:8px;white-space:nowrap/);
  assert.match(css, /\.[\w-]+>\.[\w-]+\{display:flex;flex:1;min-width:0;flex-direction:column/);
});

test('restores inline think arrows, end arrows and deterministic numbered avatars', () => {
  const think = html(ui.ThinkContent, { content: 'reason', expanded: true });
  assert.match(think, /已完成思考.*anticon-right/);
  assert.doesNotMatch(think, /ant-collapse-expand-icon/);
  assert.match(html(ui.MultiSubAgentCard, { subagents: [] }), /ant-collapse-icon-position-end/);
  assert.match(html(ui.MarkdownCodeBlock, { code: 'hello', language: 'text' }), /ant-collapse-icon-position-end/);
  const avatar = (number) => html(ui.SubAgentListItem, { subagent: { id: 'a', random_number: number } });
  assert.match(avatar(0), /data:image\/svg\+xml/);
  assert.equal(avatar(0), avatar(300));
  assert.notEqual(avatar(0), avatar(150));
  assert.doesNotMatch(avatar(undefined), /data:image\/svg\+xml/);
  assert.doesNotMatch(avatar(NaN), /data:image\/svg\+xml/);
});

test('tool results retain copy controls and expansion, and answers use readonly inputs', () => {
  const result = html(ui.ToolCallResponse, { content: 'output', defaultExpanded: true });
  assert.match(result, /aria-label="复制代码"/);
  assert.match(result, /data-expanded="true"/);
  assert.match(result, /output/);
  assert.match(html(ui.ToolCallResponse, { content: 'output' }), /data-expanded="false"/);
  const answer = html(ui.AskUserQuestionContent, {
    question: '交付要求', answer: { userMessage: '保留摘要' },
  });
  assert.match(answer, /<input[^>]*disabled=""[^>]*value="保留摘要"/);
  assert.match(html(ui.UserMessage, { content: 'question', skillName: '助手' }), /ant-tag/);
});

test('renders assistant and think content safely without a renderer', () => {
  assert.match(html(ui.AssistantContent, { content: '<script>unsafe</script>' }), /&lt;script&gt;/);
  assert.equal(html(ui.AssistantContent, { content: '   ' }), '');
  assert.match(html(ui.ThinkContent, { content: 'reason', expanded: true, isStreaming: true }), /正在思考中/);
  assert.match(html(ui.ThinkContent, { content: 'reason', expanded: true }), /reason/);
});

test('content rendering receives streaming state through explicit props', () => {
  const item = { id: 'id', msg_content_id: 'content', type: 'ASSISTANT_MSG', content: 'answer' };
  const calls = [];
  const result = html(ui.MessageContentList, {
    list: [item], streamingAssistantContentId: 'content',
    renderMarkdown: (content, streaming) => { calls.push([content, streaming]); return h('b', null, content); },
  });
  assert.deepEqual(calls, [['answer', true]]);
  assert.match(result, /<b>answer<\/b>/);
  assert.match(html(ui.MessageContentList, {
    list: [item], renderMarkdown: () => 'legacy-renderer',
    renderContent: () => h('mark', null, 'preferred-renderer'),
  }), /<mark>preferred-renderer/);
});

test('overrides, custom types and wrappers preserve the original business item', () => {
  const items = [
    { id: '1', type: 'ASSISTANT_MSG', content: 'default', auditId: 'audit' },
    { id: '2', type: 'BUSINESS_EXTENSION', auditId: 'custom' },
  ];
  const seen = [];
  const result = html(ui.MessageContentList, {
    list: items,
    renderers: {
      ASSISTANT_MSG: ({ item }) => h('b', null, item.auditId),
      BUSINESS_EXTENSION: ({ item }) => h('button', null, item.auditId),
    },
    renderItem: ({ item }, content) => { seen.push(item); return h('aside', null, content); },
  });
  assert.deepEqual(seen, items);
  assert.match(result, /<aside><b>audit<\/b><\/aside>/);
  assert.match(result, /<aside><button>custom<\/button><\/aside>/);
  assert.doesNotMatch(result, /default/);
  assert.equal(html(ui.MessageContentItem, { item: items[0], renderers: { ASSISTANT_MSG: () => null } }), '');
});

test('unknown types can fall back, including names from Object.prototype', () => {
  for (const type of ['unknown', '__proto__', 'constructor', 'toString']) {
    const props = { item: { id: type, type }, renderers: {} };
    assert.equal(html(ui.MessageContentItem, props), '');
    assert.equal(html(ui.MessageContentItem, { ...props, renderUnknown: ({ item }) => item.id }), type);
  }
});

test('split rendering keeps every other item in order and shares extension points', () => {
  const list = [
    { id: 'a', type: 'CUSTOM' }, { id: 'conclusion', type: 'CUSTOM' }, { id: 'after', type: 'CUSTOM' },
  ];
  const props = {
    list, conclusionId: 'conclusion', processExpanded: true, processTitle: '用时 3 秒',
    renderers: { CUSTOM: ({ item }) => h('b', null, item.id) },
    renderItem: (_, content) => h('aside', null, content),
  };
  const result = html(ui.MessageContentList, props);
  assert.match(result, /用时 3 秒/);
  assert.ok(result.indexOf('<b>a</b>') < result.indexOf('<b>after</b>'));
  assert.ok(result.indexOf('<b>after</b>') < result.indexOf('<b>conclusion</b>'));
  assert.equal((result.match(/<aside>/g) ?? []).length, 3);
  const unsplit = html(ui.MessageContentList, { ...props, conclusionId: 'missing' });
  assert.ok(unsplit.indexOf('<b>conclusion</b>') < unsplit.indexOf('<b>after</b>'));
  assert.doesNotMatch(unsplit, /用时 3 秒/);
  assert.equal(html(ui.MessageContentList, { list: [] }), '');
});

test('only the latest unfinished compression is shown as streaming', () => {
  const list = [
    { id: 'a', type: 'CONTEXT_COMPRESS' }, { id: 'b', type: 'CONTEXT_COMPRESS' },
  ];
  const result = html(ui.MessageContentList, { list, streamingAssistantContentId: 'b' });
  assert.match(result, /上下文压缩未完成/);
  assert.match(result, /上下文正在压缩中/);
  for (const [contextCompressStatus, label] of [['success', '成功'], ['failed', '失败']]) {
    assert.match(html(ui.MessageContentItem, { item: { ...list[1], contextCompressStatus }, isAnswerStreaming: true, isLatestContextCompress: true }), new RegExp(label));
  }
});

test('tool results and question previews retain empty and hidden states', () => {
  assert.equal(html(ui.MessageContentItem, { item: { id: '1', type: 'TOOL_CALL' } }), '');
  assert.match(html(ui.MessageContentItem, { item: { id: '1', type: 'TOOL_CALL', tool_call_name: 'CustomTool' } }), /CustomTool/);
  assert.equal(html(ui.MessageContentItem, { item: { id: '1', type: 'TOOL_RESPONSE', output: 'hidden' } }), '');
  assert.equal(html(ui.ToolCallResponse, { content: '' }), '');
  assert.match(html(ui.ToolCallResponse, { content: '<output>', expanded: true }), /&lt;output&gt;/);
  assert.equal(html(ui.AskUserQuestionContent, { question: 'q', answer: { userMessage: '  ' } }), '');
  assert.match(html(ui.AskUserQuestionContent, { question: 'q', options: [], answer: { userMessage: 'answer' } }), /answer/);
});

test('message shells, files and completion actions are individually usable', () => {
  assert.match(html(ui.UserMessage, { content: 0 }), />0<\/div>/);
  assert.match(html(ui.UserMessage, { content: 'user', metadata: 'date', files: h('span', null, 'attachment') }), /attachment/);
  assert.match(html(ui.AiMessage, { title: 'My Agent', footer: 'completed' }), /My Agent/);
  assert.match(html(ui.AiMessage, { error: 'offline', footer: 'FOOTER_SENTINEL' }), /offline/);
  assert.doesNotMatch(html(ui.AiMessage, { error: 'offline', footer: 'FOOTER_SENTINEL' }), /FOOTER_SENTINEL/);
  assert.match(html(ui.SystemMessage, { children: 'system' }), /system/);
  assert.match(html(ui.MessageItem, { role: 'assistant', children: 'body' }), /data-message-role="assistant"/);
  assert.equal(html(ui.OutputFilesCollapse, { outputFiles: [] }), '');
  assert.equal(html(ui.MessageFileList, { files: [] }), '');
  assert.match(html(ui.OutputFilesCollapse, { outputFiles: [], skillFiles: [{ fileName: 'skill.zip' }] }), /skill.zip/);
  assert.match(html(ui.SkillOutputCard, { file: { fileName: 'draft.zip' }, actions: h('button', null, 'custom') }), /custom/);
  assert.match(html(ui.ChatCompletedResult, { status: 'success', message: 'done', usage: ['10 tokens'], actions: h('button', null, 'share') }), /10 tokens/);
  assert.equal(html(ui.SuggestedQuestions, { questions: [], onSelect() {} }), '');
});

test('controlled expansion and callbacks work without a Provider', async () => {
  const window = new Window();
  const globals = {
    window, document: window.document, navigator: window.navigator,
    HTMLElement: window.HTMLElement, Element: window.Element, SVGElement: window.SVGElement,
    Node: window.Node, ShadowRoot: window.ShadowRoot,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (node) => act(async () => root.render(node));
  const click = async (element) => { assert.ok(element); await act(async () => element.click()); };
  try {
    const toggles = [];
    const item = { id: 'think', type: 'THINK_MSG', content: 'thought' };
    await render(h(ui.MessageContentItem, {
      item, contentExpandedMap: { think_THINK_MSG: false },
      onContentExpandedChange: (...args) => toggles.push(args),
    }));
    await click(container.querySelector('.ant-collapse-header'));
    assert.deepEqual(toggles, [['think_THINK_MSG', true]]);
    assert.equal(container.querySelector('.ant-collapse-header').getAttribute('aria-expanded'), 'false');
    await render(h(ui.ThinkContent, { content: 'local thought' }));
    await click(container.querySelector('.ant-collapse-header'));
    assert.equal(container.querySelector('.ant-collapse-header').getAttribute('aria-expanded'), 'true');

    const selected = [];
    await render(h(ui.SuggestedQuestions, { questions: ['ask'], onSelect: (value) => selected.push(value) }));
    await click(container.querySelector('button'));
    assert.deepEqual(selected, ['ask']);
    await render(h(ui.SuggestedQuestions, { questions: ['ask'], disabled: true, onSelect: (value) => selected.push(value) }));
    await click(container.querySelector('button'));
    assert.deepEqual(selected, ['ask']);

    const file = { fileId: 'file', fileName: 'file.txt', extra: 'business data' };
    await render(h(ui.MessageFileCard, { file, onPreview: (value) => selected.push(value) }));
    await click(container.querySelector('[aria-label="预览文件"]'));
    assert.equal(selected.at(-1), file);
    const agent = { id: 'agent', description: 'description' };
    await render(h(ui.SubAgentListItem, { subagent: agent, onSelect: (value) => selected.push(value) }));
    await click(container.querySelector('button'));
    assert.equal(selected.at(-1), agent);

    await render(h(ui.MessageActions, { actions: [{ key: 'feedback', label: '反馈', onClick: () => selected.push('feedback') }] }));
    await click(container.querySelector('button'));
    assert.equal(selected.at(-1), 'feedback');

    const copied = [];
    await render(h(ui.MarkdownCodeBlock, { language: 'javascript', code: 'const a = 1;', onCopy: (code) => copied.push(code) }));
    await click(container.querySelector('[aria-label="复制代码"]'));
    assert.deepEqual(copied, ['const a = 1;']);
    assert.equal(container.querySelector('.ant-collapse-header').getAttribute('aria-expanded'), 'true');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    assert.match(container.querySelector('code').innerHTML, /hljs-(keyword|number)/);

    await render(h(ui.AssistantContent, { content: '**默认 Markdown**' }));
    assert.equal(container.querySelector('strong').textContent, '默认 Markdown');
    await render(h(ui.AssistantContent, { content: '**自定义**', renderContent: (content) => h('mark', null, content) }));
    assert.equal(container.querySelector('mark').textContent, '**自定义**');
    assert.equal(container.querySelector('strong'), null);

    await render(h(ui.StreamingMarkdownRenderer, { content: '第一段', isStreaming: true }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
    assert.match(container.textContent, /第一段/);
    await render(h(ui.StreamingMarkdownRenderer, { content: '**最终结果**', isStreaming: false }));
    assert.equal(container.querySelector('strong').textContent, '最终结果');

    await render(h(ui.ReferenceAnchor, {
      anchor: { referenceId: 'source', idx: 1 }, title: '来源',
      contents: [{ title: 'first' }, { title: 'second', url: 'javascript:alert(1)' }],
    }));
    await act(async () => container.querySelector('button').focus());
    await click(document.querySelector('[aria-label="下一条来源"]'));
    assert.match(document.body.textContent, /second/);
    assert.equal(document.querySelector('a[href^="javascript:"]'), null);
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('MarkdownViewer keeps tables, blocks, front matter and safe links', () => {
  assert.match(html(ui.AssistantContent, { content: '**bold**' }), /<strong>bold<\/strong>/);
  assert.match(html(ui.MarkdownViewer, { content: '| a | b |\n| --- | --- |\n| 1 | 2 |' }), /<table>/);
  assert.match(html(ui.MarkdownViewer, { content: '> quote' }), /<blockquote>/);
  assert.match(html(ui.MarkdownViewer, { content: '---\ntitle: meta\n---\nbody' }), />body</);
  assert.doesNotMatch(html(ui.MarkdownViewer, { content: '---\ntitle: meta\n---\nbody' }), /title: meta/);
  assert.match(html(ui.MarkdownViewer, { content: '[external](https://example.com)' }), /target="_blank"/);
  assert.doesNotMatch(html(ui.MarkdownViewer, { content: '[source](#ref:id)' }), /target="_blank"/);
  for (const content of ['<script>alert(1)</script>', '<iframe src="bad"></iframe>', '<img src="bad" onerror="alert(1)" />']) {
    const result = html(ui.MarkdownViewer, { content });
    assert.doesNotMatch(result, /<script|<iframe|<img[^>]+onerror=/i);
  }
  assert.doesNotMatch(html(ui.MarkdownViewer, { content: '<script>alert(1)</script>', options: { disableParsingRawHTML: false } }), /<script>/);
  assert.doesNotMatch(html(ui.MarkdownViewer, { content: '[unsafe](javascript:alert(1))' }), /href="javascript:/i);
  assert.match(html(ui.MarkdownViewer, { content: '```html\n<template ref="bad">' }), /&lt;template/);
  assert.doesNotMatch(html(ui.StreamingMarkdownRenderer, { content: '![image](https://example.com/a.png)' }), /<img/);
  assert.match(html(ui.MarkdownViewer, { content: '**override**', overrides: { strong: ({ children }) => h('mark', null, children) } }), /<mark>override/);
});

test('Markdown preprocessors and metadata cover incomplete, empty and invalid inputs', () => {
  assert.equal(ui.preprocessStreamingMarkdown('```js\nlet x = 1'), '```js\nlet x = 1\n```');
  assert.equal(ui.preprocessMarkdown('text [link](https://example.com'), 'text ');
  assert.equal(ui.preprocessMarkdown('text ![image](https://example.com'), 'text ');
  assert.equal(ui.preprocessMarkdown('text `partial'), 'text ');
  assert.equal(ui.preprocessMarkdown('text <div'), 'text ');
  assert.equal(ui.preprocessStreamingMarkdown('[来源](#ref:news:1'), '[来源](#ref:news:1)');
  assert.equal(ui.preprocessStreamingExtra('**mcp__server__tool**'), '**mcp\\_\\_server\\_\\_tool**');
  for (const value of ['', null, undefined, 1, {}, []]) {
    assert.equal(ui.preprocessMarkdown(value), '');
    assert.equal(ui.preprocessStreamingExtra(value), '');
    assert.deepEqual(ui.extractFrontMatter(value), { meta: {}, content: '' });
    assert.deepEqual(ui.extractRefIdsFromText(value), []);
  }
  assert.deepEqual(ui.extractFrontMatter('---\nname: doc\n---\ntext'), { meta: { name: 'doc' }, content: 'text' });
  assert.deepEqual(ui.extractFrontMatter('---\r\nname: doc\r\n---\r\ntext'), { meta: { name: 'doc' }, content: 'text' });
  assert.deepEqual(ui.extractFrontMatter('---\nname: [\n---\ntext'), { meta: {}, content: 'text' });
  assert.deepEqual(ui.extractFrontMatter('---\nname: doc'), { meta: {}, content: '---\nname: doc' });
});

test('reference numbering survives lists, tables, duplicates and unknown fields', () => {
  const list = [
    { id: 'a', type: 'ASSISTANT_MSG', content: '- [来源](#ref:news:9)\n[来源](#ref:news:9)' },
    { id: 'b', type: 'ASSISTANT_MSG', content: '| 来源 |\n| --- |\n| [来源](#ref:news:1) |' },
    { id: 'skip', type: 'THINK_MSG', content: '[来源](#ref:skip)' },
    { id: 'empty', type: 'ASSISTANT_MSG' }, {}, null,
  ];
  assert.deepEqual(ui.buildRoundRefAnchors(list).map((anchor) => anchor.idx), [1, 2, 3]);
  assert.equal(ui.buildRefAnchorsByContentId(list).b[0].idx, 3);
  assert.deepEqual(ui.buildRoundRefAnchors(undefined), []);
  assert.deepEqual(ui.buildRoundRefAnchors([{ type: 'assistant', text: '[来源](#ref:wrong)' }]), []);
  assert.equal(ui.replaceRefAnchorsWithIdx('[来源](#ref:a)', [{ referenceId: 'b', idx: 1 }]), '[来源](#ref:a)');
  const result = html(ui.StreamingMarkdownRenderer, {
    content: '| 来源 |\n| --- |\n| [来源](#ref:news:1) |',
    refAnchors: [{ referenceId: 'news:1', idx: 3 }],
    renderReference: ({ referenceId, idx }) => h('button', { 'data-reference': referenceId }, idx),
  });
  assert.match(result, /<table>/);
  assert.match(result, /data-reference="news:1">3/);
});
