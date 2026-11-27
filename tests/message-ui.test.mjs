import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
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
const cssName = readdirSync(join(workspace, 'dist')).find((name) => name.endsWith('.css'));
const kitCss = readFileSync(join(workspace, 'dist', cssName), 'utf8');

test('standalone stylesheet entry includes the same CSS as the components', async () => {
  const result = await build({
    configFile: false, root: rootDirectory, logLevel: 'warn',
    build: {
      write: false,
      lib: { entry: join(rootDirectory, 'src/chat/ui/style.ts'), formats: ['es'], fileName: () => 'style.mjs' },
      // 比较样式收集范围，避免未使用的 CSS Module 导出被测试构建裁剪。
      rollupOptions: { treeshake: false },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const css = output.find((file) => file.type === 'asset' && file.fileName.endsWith('.css'));
  assert.ok(css, 'Missing standalone stylesheet');
  assert.equal(String(css.source), kitCss);
});

test('source stylesheet entry and Less imports survive documentation tree shaking', () => {
  const { sideEffects } = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'));
  for (const entry of ['**/*.css', '**/*.less', './src/chat/ui/style.ts']) {
    assert.ok(sideEffects.includes(entry), 'Missing stylesheet side effect: ' + entry);
  }
});

test('component CSS is scoped, themeable and independent of Ant Design base styles', async () => {
  assert.doesNotMatch(kitCss, /\.ant-btn|:root|#1890ff|#a30030/i);
  assert.ok(/var\(--finwork-primary-color,\s*var\(--ant-primary-color,\s*currentColor\)\)/.test(kitCss));
  const window = new Window();
  try {
    const { document } = window;
    const hostStyle = document.createElement('style');
    hostStyle.textContent = '.ant-btn { color: green; } .paragraph { margin-bottom: 3px; } .hljs-keyword { color: purple; }';
    document.head.append(hostStyle);
    document.body.innerHTML = '<button class="ant-btn">Host</button><p class="paragraph">Host paragraph</p><code><span class="hljs-keyword">Host code</span></code>';
    const hostElements = [...document.body.children, document.querySelector('.hljs-keyword')];
    const snapshot = () => hostElements.map((element) => {
      const style = window.getComputedStyle(element);
      return [style.color, style.marginBottom, style.display];
    });
    const before = snapshot();
    const style = document.createElement('style');
    style.textContent = kitCss;
    document.head.append(style);
    assert.deepEqual(snapshot(), before);

    const kit = document.createElement('section');
    kit.innerHTML = html(ui.AiMessage, { title: 'Themed agent' }) + html(ui.CodeViewer, { language: 'text', content: 'code' });
    document.body.append(kit);
    const header = kit.querySelector('[class*="_aiHeader_"]');
    for (const [variable, color] of [['--ant-primary-color', '#123456'], ['--finwork-primary-color', '#654321']]) {
      kit.style.setProperty(variable, color);
      assert.equal(window.getComputedStyle(header).color, color);
    }
    const keyword = document.createElement('span');
    keyword.className = 'hljs-keyword';
    kit.querySelector('code').append(keyword);
    assert.notEqual(window.getComputedStyle(keyword).color, 'purple');
  } finally {
    await window.happyDOM.close();
  }
});

test('host ConfigProvider supplies prefix, direction and component size', () => {
  const result = renderToStaticMarkup(h(ConfigProvider, { prefixCls: 'host', direction: 'rtl', componentSize: 'large' },
    h(ui.SuggestedQuestions, { questions: ['Host question'], onSelect() {} })));
  assert.match(result, /host-btn-lg/);
  assert.match(result, /host-btn-rtl/);
  assert.doesNotMatch(result, /ant-btn/);
});

const opcTimeline = [
  { id: 'opening', kind: 'leader', name: '团长甲', isStreaming: true },
  {
    id: 'dispatch', kind: 'dispatch',
    assignments: [{ id: 'research', member: '专家甲', prompt: '核对记录', status: { status: 'idle', label: '等待执行' } }],
  },
  {
    id: 'report', kind: 'report', name: '专家乙', status: { status: 'completed', label: '已回传' },
    content: '**核对完成**', target: { kind: 'reply', id: 'research' },
  },
];

test('OPC preserves timeline order and supports reading without execution actions', () => {
  const result = html(ui.OpcRound, { id: 'round', timeline: opcTimeline, error: '<error>', footer: 'footer' });
  assert.match(result, /id="round" data-chat-row-id="round"/);
  assert.match(result, /data-kind="leader".*正在回复.*data-kind="dispatch".*核对记录.*data-kind="report".*<strong>核对完成<\/strong>/);
  assert.match(result, /role="alert">&lt;error&gt;.*footer/);
  assert.doesNotMatch(result, /<button/);
  assert.doesNotMatch(html(ui.OpcRound, { timeline: [] }), /协作时间线/);
  const shared = html(ui.MessageItem, {
    role: 'opc_assistant',
    children: h(ui.OpcAnswer, { timeline: opcTimeline, error: '连接异常', footer: '共享页脚' }),
  });
  assert.match(shared, /data-message-role="opc_assistant"/);
  assert.match(shared, /aria-label="协作时间线"/);
  assert.match(shared, /role="alert">连接异常/);
  assert.match(shared, /共享页脚/);
  const questionOnly = html(ui.OpcAnswer, {
    timeline: [],
    contentList: [
      { id: 'ask', type: 'ASK_USER_QUESTION', question: '选择方向？', options: [{ id: 'a', text: '夜景' }], userAnswer: { optionId: 'a' } },
      { id: 'text', type: 'ASSISTANT_MSG', content: 'visible only on the timeline' },
    ],
  });
  assert.match(questionOnly, /选择方向？.*夜景/);
  assert.doesNotMatch(questionOnly, /visible only on the timeline/);
  assert.match(html(ui.OpcExpertPanel, {
    members: [{ id: 'worker', name: '专家甲' }], memberId: 'worker',
    tasks: [], taskId: 'missing', onMemberChange() {}, onTaskChange() {},
  }), /暂无专家执行记录/);
});

test('only active thinking, tool calls and OPC statuses use the reduced-motion-aware shine', () => {
  assert.match(kitCss, /@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*runningShine/);
  assert.match(kitCss, /@supports\s*\(\(-webkit-background-clip:\s*text\)\s*or\s*\(background-clip:\s*text\)\)[\s\S]*thinkShine/);
  assert.match(kitCss, /thinkDotsCycle/);
  assert.match(kitCss, /thinkShineSweep/);
  assert.match(kitCss, /@media\s*\(forced-colors:\s*active\)[\s\S]*CanvasText/);
  const activeThink = html(ui.ThinkContent, { content: 'think', isStreaming: true });
  assert.match(activeThink, /thinkShine/);
  assert.match(activeThink, /thinkDots/);
  assert.doesNotMatch(activeThink, /runningShine/);
  const idleThink = html(ui.ThinkContent, { content: 'think' });
  assert.doesNotMatch(idleThink, /thinkShine|thinkDots|runningShine/);
  for (const [component, base, active] of [
    [ui.ToolCallMsg, { label: 'Read' }, { isStreaming: true }],
    [ui.OpcStatus, { status: 'completed', label: '任务' }, { status: 'running' }],
  ]) {
    assert.match(html(component, { ...base, ...active }), /runningShine/);
    assert.doesNotMatch(html(component, base), /runningShine/);
  }
});

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
  assert.doesNotMatch(finished, /#a30030|#1890ff/);
  assert.match(finished, /anticon-check-circle/);
  const custom = html(ui.SubAgentListItem, { subagent: { id: 'custom' }, color: '#1890ff' });
  assert.match(custom, /background-color:#1890ff/);
  assert.match(custom, /color:#1890ff/);
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

    const hostToggles = [];
    await render(h(ConfigProvider, { prefixCls: 'host' }, h(ui.ThinkContent, {
      key: 'host', content: 'host thought', onExpandedChange: (value) => hostToggles.push(value),
    })));
    const style = document.createElement('style');
    style.textContent = kitCss;
    document.head.append(style);
    const hostHeader = container.querySelector('.host-collapse-header');
    assert.equal(window.getComputedStyle(hostHeader).padding, '4px 8px');
    const headerText = container.querySelector('.host-collapse-header-text');
    assert.notEqual(window.getComputedStyle(headerText).padding, '4px 8px');
    await click(hostHeader);
    assert.deepEqual(hostToggles, [true]);
    assert.equal(hostHeader.getAttribute('aria-expanded'), 'true');

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

    const executionTargets = [];
    await render(h(ui.OpcAnswer, {
      timeline: opcTimeline, onOpenExecution: (target) => executionTargets.push(target),
    }));
    const description = container.querySelector('summary');
    assert.equal(document.getElementById(description.getAttribute('aria-describedby')).textContent, '核对记录');
    for (const button of container.querySelectorAll('button[data-status]')) await click(button);
    assert.deepEqual(executionTargets, [{ kind: 'assignment', id: 'research' }, { kind: 'reply', id: 'research' }]);

    const panelProps = {
      members: [{ id: 'expert', name: '专家' }],
      memberId: 'expert',
      tasks: [{ id: 'first', prompt: '查阅资料' }, { id: 'second', prompt: '核对资料' }],
      onMemberChange() {},
      onTaskChange: (id) => selected.push(id),
    };
    const panel = (taskId) => h(ui.OpcExpertPanel, { ...panelProps, taskId }, '执行详情');
    await render(panel('first'));
    const taskPicker = container.querySelector('input[aria-label="选择任务"]');
    await act(async () => taskPicker.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
    assert.equal(taskPicker.getAttribute('aria-expanded'), 'true');
    assert.ok(document.querySelector('[role="option"][aria-label="任务 02，核对资料"]'));
    await click(document.querySelector('.ant-select-item-option[title="核对资料"]'));
    assert.equal(selected.at(-1), 'second');
    const taskSelection = taskPicker.closest('.ant-select');
    assert.match(taskSelection.textContent, /查阅资料/);
    await render(panel('second'));
    assert.match(taskSelection.textContent, /核对资料/);

    await render(h(ui.MessageActions, { actions: [{ key: 'feedback', label: '反馈', onClick: () => selected.push('feedback') }] }));
    await click(container.querySelector('button'));
    assert.equal(selected.at(-1), 'feedback');

    const copied = [];
    await render(h(ui.MarkdownCodeBlock, { language: 'javascript', code: 'const a = 1;', onCopy: (code) => copied.push(code) }));
    const antStyles = document.createElement('style');
    antStyles.textContent = readFileSync(join(rootDirectory, 'node_modules/antd/dist/antd.css'), 'utf8');
    document.head.append(antStyles);
    const codeHeader = container.querySelector('.ant-collapse-header');
    const copyButton = container.querySelector('[aria-label="复制代码"]');
    const headerStyle = window.getComputedStyle(codeHeader);
    assert.equal(headerStyle.paddingTop, '12px');
    assert.equal(headerStyle.paddingBottom, '12px');
    assert.equal(headerStyle.paddingRight, '40px');
    assert.equal(window.getComputedStyle(copyButton).height, 'auto');
    await click(copyButton);
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

test('chat Markdown renderers preserve leading YAML and --- sections while MarkdownViewer still strips front matter by default', () => {
  const yamlExample = '---\nhost: localhost\nport: 8080\n---\n\n正文';
  const singleFieldYaml = '---\nport: 8080\n---\n\n正文';
  const hrSections = '---\n\n## 第一节\n\n内容\n\n---\n\n### 第二节';
  const metas = [];
  const docHtml = html(ui.MarkdownViewer, { content: yamlExample, onMeta: (meta) => metas.push(meta) });
  assert.doesNotMatch(docHtml, /host: localhost/);
  assert.deepEqual(metas, [{ host: 'localhost', port: 8080 }]);
  assert.match(html(ui.MarkdownViewer, { content: yamlExample, skipFrontMatter: true }), /host: localhost[\s\S]*port: 8080[\s\S]*正文/);

  for (const render of [
    (content) => html(ui.StreamingMarkdownRenderer, { content }),
    (content) => html(ui.AssistantContent, { content }),
    (content) => html(ui.OpcRound, { timeline: [{ id: 'l', kind: 'leader', name: '团长', content }] }),
  ]) {
    assert.match(render(yamlExample), /host: localhost[\s\S]*port: 8080[\s\S]*正文/);
    const singleMarkup = render(singleFieldYaml);
    assert.match(singleMarkup, /port: 8080[\s\S]*正文/);
    assert.doesNotMatch(singleMarkup, /<h[1-6][^>]*>port: 8080/);
    assert.match(render(hrSections), /role="separator"[\s\S]*第一节[\s\S]*role="separator"[\s\S]*第二节/);
  }
});

test('MessageContentList renders tool details, failed status and reference cards', async () => {
  const toolList = [
    {
      id: 'ok-tool',
      type: 'TOOL_CALL',
      sourceId: 'ok-tool',
      tool_call_name: 'WRITE_TEXT_FILE',
      state: 'success',
      input: { file_path: '/workspace/out.md' },
      output: '已写入 /workspace/out.md',
    },
    {
      id: 'fail-tool',
      type: 'TOOL_CALL',
      sourceId: 'fail-tool',
      tool_call_name: 'READ_FILE',
      state: 'error',
      input: 'missing.md',
    },
  ];
  const toolMarkup = html(ui.MessageContentList, { list: toolList });
  assert.match(toolMarkup, /WRITE_TEXT_FILE/);
  assert.match(toolMarkup, /out\.md/);
  assert.match(toolMarkup, /READ_FILE · error/);
  assert.match(toolMarkup, /data-failed="true"/);
  const incrementalTools = html(ui.MessageContentList, {
    list: [
      { id: 'mcp', type: 'TOOL_CALL', tool_call_name: 'mcp__documents__search' },
      { id: 'bash', type: 'TOOL_CALL', tool_call_name: 'BASH', delta: { command: 'cat notes.md' } },
    ],
    streamingAssistantContentId: 'mcp',
    contentExpandedMap: { bash_TOOL_CALL: true },
    onContentExpandedChange() {},
  });
  assert.match(incrementalTools, /正在调用 MCP : documents - search/);
  assert.match(incrementalTools, /正在输入参数/);
  assert.match(incrementalTools, /cat notes\.md/);

  const refList = [
    { id: 'think', type: 'THINK_MSG', content: '思考 [来源](#ref:skip)' },
    { id: 'a1', type: 'ASSISTANT_MSG', content: '第一句[来源](#ref=news:1]）和[来源](#ref:news:2])' },
    { id: 'a2', type: 'ASSISTANT_MSG', content: '结论[来源](#ref:news:3）' },
  ];
  assert.deepEqual(
    ui.extractRefIdsFromText('A [来源](#ref:a:1) B [来源](#ref=a:2]) C [来源](#ref:a:3） D [来源](#ref=a:4]） E [来源](#ref:incomplete'),
    ['a:1', 'a:2', 'a:3', 'a:4'],
  );
  assert.equal(
    ui.replaceRefAnchorsWithIdx('(A [来源](#ref=a:2])) B [来源](#ref:a:3）', [
      { referenceId: 'a:2', idx: 1 },
      { referenceId: 'a:3', idx: 2 },
    ]),
    '(A [1](#ref:a:2)) B [2](#ref:a:3)',
  );
  assert.deepEqual(
    ui.extractRefIdsFromText('A 【来源】（#ref：a：1） B (来源]【#ref:a:2) C [来源）[#ref=a:3】 D [来源](#ref:a:4））E [来源](#ref：incomplete'),
    ['a:1', 'a:2', 'a:3', 'a:4'],
  );
  assert.equal(
    ui.replaceRefAnchorsWithIdx('A 【来源】（#ref：a：1）后文 B (来源][#ref=a:2】）', [
      { referenceId: 'a:1', idx: 1 },
      { referenceId: 'a:2', idx: 2 },
    ]),
    'A [1](#ref:a:1)后文 B [2](#ref:a:2)',
  );
  assert.equal(ui.preprocessStreamingExtra('论述 【来源】（#ref：a：1'), '论述 [来源](#ref:a:1)');
  assert.equal(ui.preprocessStreamingExtra('论述 (来源][#ref:a:1'), '论述 [来源](#ref:a:1)');
  assert.equal(ui.preprocessStreamingExtra('第一句[来源](#ref：partial，第二句'), '第一句\\[来源](#ref：partial，第二句');
  const renderReference = ({ referenceId, idx }) => h('button', { 'data-ref-id': referenceId }, `[${idx}]`);
  for (const extraProps of [{}, { conclusionId: 'a2', processExpanded: true }]) {
    const refMarkup = html(ui.MessageContentList, { list: refList, renderReference, ...extraProps });
    assert.match(refMarkup, /data-ref-id="news:1">\[1\]/);
    assert.match(refMarkup, /data-ref-id="news:2">\[2\]/);
    assert.match(refMarkup, /data-ref-id="news:3">\[3\]/);
  }

  const codeSampleContent = [
    '```md',
    '[来源](#ref:sample)',
    '```',
    '',
    '> ```md',
    '> [来源](#ref:quoted)',
    '> ```',
    '',
    '行内示例 `[来源](#ref:inline)` 与 `` `[来源](#ref:inline2)` ``，正文引用[来源](#ref:real)',
    '',
    '```md',
    '[来源](#ref:unclosed-fence)',
  ].join('\n');
  assert.deepEqual(ui.extractRefIdsFromText(codeSampleContent), ['real']);
  for (const withRenderer of [true, false]) {
    const rendered = html(ui.MessageContentList, {
      list: [{ id: 'code-ref', type: 'ASSISTANT_MSG', content: codeSampleContent }],
      ...(withRenderer ? { renderReference } : {}),
    });
    assert.match(rendered, /\[来源\]\(#ref:sample\)/);
    assert.match(rendered, /\[来源\]\(#ref:quoted\)/);
    assert.match(rendered, /\[来源\]\(#ref:inline\)/);
    assert.match(rendered, /\[来源\]\(#ref:inline2\)/);
    assert.match(rendered, /\[来源\]\(#ref:unclosed-fence\)/);
    if (withRenderer) {
      assert.match(rendered, /data-ref-id="real">\[1\]/);
    } else {
      assert.match(rendered, /href="#ref:real"[^>]*>1<\/a>/);
    }
  }

  for (const brokenAndValid of [
    '[来源](#ref:partial\n\n第二段 [来源](#ref:valid)',
    '第一句 [来源](#ref:partial 第二句 [来源](#ref:valid)',
    '第一句[来源](#ref:partial，第二句[来源](#ref:valid)',
    '第一句[来源](#ref:partial[来源](#ref:valid)',
  ]) {
    assert.deepEqual(ui.extractRefIdsFromText(brokenAndValid), ['valid']);
    const rendered = html(ui.MessageContentList, {
      list: [{ id: 'broken-ref', type: 'ASSISTANT_MSG', content: brokenAndValid }],
      renderReference,
    });
    assert.match(rendered, /\[来源\]\(#ref:partial/);
    assert.match(rendered, /data-ref-id="valid">\[1\]/);
  }

  const escapedBroken = '已转义残缺 \\[来源](#ref:partial，后续正文与 [来源](#ref:valid)';
  const escapedComplete = '已转义完整 \\[来源](#ref:escaped) 与 [来源](#ref:valid)';
  assert.deepEqual(ui.extractRefIdsFromText(escapedBroken), ['valid']);
  assert.deepEqual(ui.extractRefIdsFromText(escapedComplete), ['valid']);
  assert.equal(ui.preprocessStreamingExtra(escapedBroken), escapedBroken);
  assert.equal(ui.preprocessStreamingExtra(ui.preprocessStreamingExtra('第一句[来源](#ref:partial，第二句')), '第一句\\[来源](#ref:partial，第二句');
  const escapedBrokenHtml = html(ui.MessageContentList, {
    list: [{ id: 'escaped-broken', type: 'ASSISTANT_MSG', content: escapedBroken }],
    renderReference,
  });
  assert.match(escapedBrokenHtml, /\[来源\]\(#ref:partial，后续正文与/);
  assert.match(escapedBrokenHtml, /data-ref-id="valid">\[1\]/);
  const escapedCompleteHtml = html(ui.MessageContentList, {
    list: [{ id: 'escaped-complete', type: 'ASSISTANT_MSG', content: escapedComplete }],
    renderReference,
  });
  assert.match(escapedCompleteHtml, /\[来源\]\(#ref:escaped\) 与/);
  assert.match(escapedCompleteHtml, /data-ref-id="valid">\[1\]/);

  const multiBacktick = '请使用 `` ` `` 表示反引号，详见报告[来源](#ref:valid)';
  const escapedBacktick = '转义反引号 \\` 后的正文[来源](#ref:valid)';
  assert.equal(ui.preprocessMarkdown(multiBacktick), multiBacktick);
  assert.equal(ui.preprocessStreamingMarkdown(multiBacktick), multiBacktick);
  assert.equal(ui.preprocessMarkdown(escapedBacktick), escapedBacktick);
  assert.equal(ui.preprocessMarkdown('已闭合 `` ` `` 后跟未闭合 `partial'), '已闭合 `` ` `` 后跟未闭合 ');
  for (const sample of [multiBacktick, escapedBacktick]) {
    const rendered = html(ui.MessageContentList, {
      list: [{ id: 'inline-ticks', type: 'ASSISTANT_MSG', content: sample }],
      renderReference,
    });
    assert.match(rendered, /data-ref-id="valid">\[1\]/);
    assert.match(rendered, /详见报告|后的正文/);
  }
  assert.match(
    html(ui.MessageContentList, { list: [{ id: 'multi-code', type: 'ASSISTANT_MSG', content: multiBacktick }], renderReference }),
    /<code>\s*`\s*<\/code>[\s\S]*表示反引号/,
  );

  const singlePara64K = '片段 `inline_code` 与 `` `` ` `` `` 文本 '.repeat(1800) + '[来源](#ref:tail)';
  assert.ok(singlePara64K.length > 60_000);
  const t0 = performance.now();
  const extracted64K = ui.extractRefIdsFromText(singlePara64K);
  const replaced64K = ui.replaceRefAnchorsWithIdx(singlePara64K, [{ referenceId: 'tail', idx: 1 }]);
  const elapsedMs = performance.now() - t0;
  assert.deepEqual(extracted64K, ['tail']);
  assert.ok(replaced64K.endsWith('[1](#ref:tail)'));
  assert.ok(elapsedMs < 50, `Expected linear scan < 50ms, got ${elapsedMs.toFixed(2)}ms`);

  for (const quoteFenceSample of [
    '> ```md\n> [来源](#ref:quoted)\n\n正文 [来源](#ref:real)',
    '> > ```md\n> > [来源](#ref:nested)\n>\n> 外层引用 [来源](#ref:real)',
    '> ```md\n> [来源](#ref:quoted)\n\n> 新引用块 [来源](#ref:real)',
    '- 列表项\n\n  > ```md\n  > [来源](#ref:quoted)\n\n正文 [来源](#ref:real)',
  ]) {
    assert.deepEqual(ui.extractRefIdsFromText(quoteFenceSample), ['real']);
    const rendered = html(ui.MessageContentList, {
      list: [{ id: 'quote-fence', type: 'ASSISTANT_MSG', content: quoteFenceSample }],
      renderReference,
    });
    assert.match(rendered, /\[来源\]\(#ref:(?:quoted|nested)\)/);
    assert.match(rendered, /data-ref-id="real">\[1\]/);
    assert.doesNotMatch(rendered, /<pre><code>\s*<\/code><\/pre>\s*<\/div>/);
  }

  for (const streamingCodeSample of [
    '```md\n[来源](#ref:literal',
    '> ```md\n> [来源](#ref:literal',
    '示例 `[来源](#ref:literal',
  ]) {
    assert.equal(ui.preprocessStreamingExtra(streamingCodeSample), streamingCodeSample);
  }
  assert.equal(ui.preprocessStreamingMarkdown('```md\n[来源](#ref:literal'), '```md\n[来源](#ref:literal\n```');
  assert.equal(ui.preprocessStreamingMarkdown('> ```md\n> [来源](#ref:literal'), '> ```md\n> [来源](#ref:literal\n> ```');
  assert.equal(ui.preprocessStreamingMarkdown('示例 `[来源](#ref:literal'), '示例 ');
  assert.equal(ui.preprocessStreamingMarkdown('~~~md\n[来源](#ref:literal'), '~~~md\n[来源](#ref:literal\n~~~');
  const literalFenceHtml = html(ui.MessageContentList, {
    list: [{ id: 'stream-literal', type: 'ASSISTANT_MSG', content: '```md\n[来源](#ref:literal' }],
    renderReference,
  });
  assert.match(literalFenceHtml, /\[来源\]\(#ref:literal/);
  assert.doesNotMatch(literalFenceHtml, /\[来源\]\(#ref:literal\)/);

  assert.equal(ui.preprocessMarkdown('示例 `[a](b`'), '示例 `[a](b`');
  assert.equal(ui.preprocessMarkdown('示例 `<div`'), '示例 `<div`');
  assert.equal(ui.preprocessStreamingExtra('` **mcp__server__tool** `'), '` **mcp__server__tool** `');

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
  try {
    const expanded = {};
    const toggles = [];
    await act(async () => root.render(h(ui.MessageContentList, {
      list: [toolList[0]],
      contentExpandedMap: expanded,
      onContentExpandedChange: (key, next) => toggles.push([key, next]),
    })));
    const headers = [...container.querySelectorAll('.ant-collapse-header')];
    assert.equal(headers.length, 1);
    assert.equal(headers[0].getAttribute('aria-expanded'), 'false');
    await act(async () => headers[0].click());
    assert.deepEqual(toggles, [['ok-tool_TOOL_CALL', true]]);

    const content = '详见【来源】（#ref:news:1）';
    const frames = [];
    globalThis.requestAnimationFrame = (callback) => frames.push(callback);
    globalThis.cancelAnimationFrame = () => {};
    await act(async () => root.render(h(ui.MessageContentList, {
      list: [{ id: 'streaming-ref', type: 'ASSISTANT_MSG', content }],
      streamingAssistantContentId: 'streaming-ref',
      renderReference,
    })));
    await act(async () => {
      for (let i = 0; i < content.length; i += 1) frames[i](i * 16);
    });
    assert.equal(container.querySelector('[data-ref-id="news:1"]')?.textContent, '[1]');
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('ToolExecutionCard and command lifecycle rendering support truncation, empty details, failure and copy', async () => {
  const longPreview = `${'a'.repeat(130)}\nsecond line`;
  const truncated = html(ui.ToolExecutionCard, {
    icon: h('span', null, 'I'),
    label: '读取文件',
    preview: longPreview,
    isRunning: true,
    details: [],
  });
  assert.match(truncated, new RegExp(`读取文件 ${'a'.repeat(120)}…`));
  assert.doesNotMatch(truncated, /second line/);
  assert.match(truncated, /thinkShine/);

  const emptyExpanded = html(ui.ToolExecutionCard, {
    icon: h('span', null, 'I'),
    label: '空工具',
    expanded: true,
    details: [{ label: 'input', value: '' }, { label: 'output', value: undefined }],
  });
  assert.match(emptyExpanded, /role="status"[^>]*aria-label="暂无详情">\/<\/div>/);

  const waiting = html(ui.MessageContentList, {
    list: [{ id: 'c1', type: 'TOOL_CALL', tool_call_name: 'BASH', inputComplete: true, input: { command: 'ls' } }],
    streamingAssistantContentId: 'other',
  });
  assert.match(waiting, /等待执行结果/);

  const done = html(ui.MessageContentList, {
    list: [{
      id: 'c2', type: 'TOOL_CALL', tool_call_name: 'EXECUTE_SHELL_COMMAND',
      inputComplete: true, responseReceived: true, returncode: 0, input: { command: 'pwd' }, output: '/app',
    }],
  });
  assert.match(done, /命令执行完成/);
  assert.doesNotMatch(done, /data-failed="true"/);

  const failedPy = html(ui.MessageContentList, {
    list: [{
      id: 'c3', type: 'TOOL_CALL', tool_call_name: 'EXECUTE_PYTHON_CODE',
      inputComplete: true, responseReceived: true, returncode: 1,
      input: { code: '1/0' }, output: 'ZeroDivisionError', stderr: 'ZeroDivisionError',
    }],
    contentExpandedMap: { c3_TOOL_CALL: true },
    onContentExpandedChange() {},
  });
  assert.match(failedPy, /代码执行失败/);
  assert.match(failedPy, /data-failed="true"/);
  assert.equal((failedPy.match(/ZeroDivisionError/g) ?? []).length, 1);

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
  try {
    const copied = [];
    const outerClicks = [];
    await act(async () => root.render(h('div', { onClick: () => outerClicks.push('outer') },
      h(ui.ToolExecutionCard, {
        icon: h('span', null, 'I'),
        label: '命令执行完成',
        details: [{ label: 'command', value: 'echo hi' }],
        onCopy: (text) => copied.push(text),
      }),
    )));
    await act(async () => container.querySelector('.ant-collapse-header').click());
    assert.equal(outerClicks.length, 0);
    assert.equal(container.querySelector('.ant-collapse-header').getAttribute('aria-expanded'), 'true');
    await act(async () => container.querySelector('[aria-label="复制command"]').click());
    assert.deepEqual(copied, ['echo hi']);
    assert.equal(outerClicks.length, 0);
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('OPC status iconOnly and upgraded timeline entries support new and legacy fields', () => {
  const iconOnlyDefault = html(ui.OpcStatus, {
    iconOnly: true,
    action: { member: '写作专家', onClick() {} },
  });
  assert.match(iconOnlyDefault, /anticon-file-search/);
  assert.match(iconOnlyDefault, /aria-label="查看任务详情 · 写作专家"/);
  assert.doesNotMatch(iconOnlyDefault, /anticon-right/);

  const iconOnlyRunning = html(ui.OpcStatus, {
    status: 'running',
    label: '执行中',
    iconOnly: true,
    action: { member: '写作专家', onClick() {} },
  });
  assert.match(iconOnlyRunning, /runningShine/);
  assert.doesNotMatch(iconOnlyRunning, />执行中</);

  const streamingTimeline = html(ui.OpcAnswer, {
    timeline: [
      {
        id: 'leader-live', kind: 'leader', name: '团长', isStreaming: true,
        process: h('div', null, '流式思考过程'),
      },
      {
        id: 'dispatch-1', kind: 'dispatch', name: '核对团长',
        assignments: [{ id: 'a1', member: '数据专家', prompt: '检索年报' }],
      },
      {
        id: 'report-1', kind: 'report', name: '数据专家',
        contents: [
          { id: 'r1', content: '第一段汇报' },
          { id: 'r2', content: '第二段汇报', isStreaming: false },
          { id: 'r3', content: '流式尾部', isStreaming: true },
        ],
        target: { kind: 'assignment', id: 'a1' },
      },
    ],
    timelineFooter: h('div', null, '完成页脚'),
    processing: h('span', null, '任务进行中'),
    footer: h('div', null, '推荐追问'),
    onOpenExecution() {},
  });
  assert.match(streamingTimeline, /流式思考过程/);
  assert.match(streamingTimeline, /data-kind="dispatch"[\s\S]*?anticon-team[\s\S]*?<h2>核对团长<\/h2>[\s\S]*?团长[\s\S]*?任务派发/);
  assert.doesNotMatch(streamingTimeline, /role="alert"/);
  assert.match(streamingTimeline, /data-kind="report"[\s\S]*?第一段汇报[\s\S]*?第二段汇报[\s\S]*?\|/);
  assert.doesNotMatch(streamingTimeline, />团员</);
  assert.match(streamingTimeline, /data-kind="footer"[\s\S]*?anticon-info-circle[\s\S]*?完成页脚/);
  assert.match(streamingTimeline, /任务进行中[\s\S]*?推荐追问/);

  const fallbackDispatch = html(ui.OpcAnswer, {
    timeline: [{ id: 'd-default', kind: 'dispatch', assignments: [{ id: 'a1', member: '专家' }] }],
  });
  assert.match(fallbackDispatch, /<h2>团长<\/h2>[\s\S]*?任务派发/);

  const completedLeader = html(ui.OpcAnswer, {
    timeline: [
      {
        id: 'leader-done', kind: 'leader', name: '团长', isStreaming: false,
        processTitle: '执行过程',
        process: h('div', null, '已折叠步骤'),
        conclusion: h('div', null, '最终总结'),
      },
    ],
  });
  assert.match(completedLeader, /执行过程/);
  assert.doesNotMatch(completedLeader, /已折叠步骤/);
  assert.match(completedLeader, /最终总结/);
});

test('OPC status background and running shine provide fallbacks without unprotected color-mix()', () => {
  let stripped = '';
  for (let i = 0; i < kitCss.length; i += 1) {
    if (kitCss.startsWith('@supports', i)) {
      const brace = kitCss.indexOf('{', i);
      const condition = kitCss.slice(i, brace);
      if (brace !== -1 && condition.includes('color-mix(')) {
        let depth = 0;
        let end = brace;
        for (; end < kitCss.length; end += 1) {
          if (kitCss[end] === '{') depth += 1;
          else if (kitCss[end] === '}') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        i = end;
        continue;
      }
    }
    stripped += kitCss[i];
  }
  assert.doesNotMatch(stripped, /color-mix\(/);

  const shineBefore = kitCss.match(/\._runningShine_[^}]*?:{1,2}before\{[^}]*\}/);
  assert.ok(shineBefore, 'Missing runningShine ::before rule');
  assert.match(shineBefore[0], /opacity:\s*0?\.2\b/);
  assert.doesNotMatch(shineBefore[0], /color-mix\(/);

  assert.match(kitCss, /\._state_[^}]*:not\(\[data-status=idle\]\):not\(\[data-status=cancelled\]\)/);
  const stateAfter = kitCss.match(/\._state_[^}]*:not\(\[data-status=idle\]\):not\(\[data-status=cancelled\]\):{1,2}after\{[^}]*\}/);
  assert.ok(stateAfter, 'Missing OPC state ::after fallback background rule');
  assert.match(stateAfter[0], /z-index:\s*-2\b/);
  assert.match(stateAfter[0], /background:\s*var\(--state-tone\)/);
  assert.match(stateAfter[0], /opacity:\s*0?\.1\b/);

  assert.doesNotMatch(kitCss, /:is\(|:where\(|:dir\(/);
  assert.doesNotMatch(kitCss, /:not\([^)]*,[^)]*\)/);
  assert.doesNotMatch(kitCss, /@supports\s*\(\s*background-clip:\s*text\s*\)/);
  assert.doesNotMatch(kitCss, /\b(?:inset|margin|padding)-(?:block|inline)(?:-(?:start|end))?\s*:/);
  assert.doesNotMatch(kitCss, /[^{}]*:hover[^{}]*,[^{}]*:focus-visible|[^{}]*:focus-visible[^{}]*,[^{}]*:hover/);
});
