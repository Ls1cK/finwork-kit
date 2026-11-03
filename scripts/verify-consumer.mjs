import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'finwork-kit-consumer-'));
const consumer = join(workspace, 'consumer');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const npmOptions = ['--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(workspace, 'npm-cache')];

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
  write('package.json', { name: 'finwork-kit-consumer', private: true, type: 'module' });
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', workspace, ...npmOptions], root));
  assert.ok(packed.files.length > 0, 'Empty npm tarball');
  for (const { path } of packed.files) {
    assert.match(path, /^(dist\/|package\.json$|readme(?:\.[^/]+)?$|licen[cs]e(?:\.[^/]+)?$)/i, 'Unexpected tarball file: ' + path);
  }
  run('npm', ['install', join(workspace, packed.filename), '--package-lock=false', ...npmOptions]);
  assert.equal(existsSync(join(consumer, 'node_modules/react')), false, 'Core consumer must not install React');
  assert.equal(existsSync(join(consumer, 'node_modules/react-dom')), false, 'Core consumer must not install react-dom');

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
  console.log('Tarball whitelist and pure core consumer without React/DOM passed.');

  for (const dependency of ['react', 'react-dom', '@types/react', '@types/react-dom']) {
    const target = join(consumer, 'node_modules', dependency);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(realpathSync(join(root, 'node_modules', dependency)), target, 'dir');
  }
  write('tsconfig.json', {
    extends: './tsconfig.core.json',
    compilerOptions: {
      lib: ['ES2020', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx',
      module: 'ESNext', moduleResolution: 'Bundler',
    },
    include: ['core.ts', 'ui.tsx'],
  });
  write('ui.tsx', `import { createRoot } from 'react-dom/client';
import { ChatExample, type ChatExampleProps } from '${manifest.name}/chat/ui';
import '${manifest.name}/chat/style.css';
const props: ChatExampleProps = { title: 'Consumer UI' };
// @ts-expect-error Invalid props must fail through published declarations.
const invalid: ChatExampleProps = { title: 1 };
createRoot(document.createElement('div')).render(<ChatExample {...props} />);
`);
  write('ui.mjs', `import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatExample } from '${manifest.name}/chat/ui';
const html = renderToStaticMarkup(createElement(ChatExample, { title: '<Consumer UI>' }));
assert.match(html, /&lt;Consumer UI&gt;/);
assert.match(renderToStaticMarkup(createElement(ChatExample)), /FinWork Chat/);
`);
  await verifyUI('tarball');

  const packageDirectory = join(consumer, 'node_modules', manifest.name);
  rmSync(packageDirectory, { recursive: true, force: true });
  symlinkSync(root, packageDirectory, 'dir');
  typecheck('tsconfig.core.json');
  run(process.execPath, ['core.mjs']);
  await verifyUI('symlink');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
