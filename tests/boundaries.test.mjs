import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkBoundaries } from '../scripts/check-boundaries.mjs';

function inspect(files, config = {}) {
  const root = mkdtempSync(join(tmpdir(), 'finwork-kit-boundaries-'));
  const sources = {
    'package.json': JSON.stringify({
      name: '@lz19.02/finwork-kit',
      peerDependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        paths: {
          '@lz19.02/finwork-kit/chat/core-sse': ['./src/chat/core-sse/index.ts'],
          '@lz19.02/finwork-kit/chat/ui': ['./src/chat/ui/index.ts'],
        },
      },
      include: ['src'],
      ...config,
    }),
    'src/chat/core-sse/index.ts': 'export const value = 1;',
    'src/chat/core-detail/index.ts': 'export const value = 2;',
    ...files,
  };
  try {
    for (const [name, content] of Object.entries(sources)) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), content);
    }
    return checkBoundaries(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('allows pure shared modules, public core aliases and UI peers/styles', () => {
  assert.deepEqual(inspect({
    'src/chat/shared.ts': 'export const shared = 1;',
    'src/chat/core-sse/index.ts': "export { shared } from '../shared';",
    'src/chat/core-detail/index.ts': "export { shared } from '@lz19.02/finwork-kit/chat/core-sse';",
    'src/chat/ui/index.ts': "import 'react/jsx-runtime'; import './style.less';",
    'src/chat/ui/style.less': '.example { color: red; }',
  }), []);
});

for (const [name, files, message] of [
  ['docs import', {
    'src/chat/ui/index.ts': "export { value } from '../../../docs/example';",
    'docs/example.ts': 'export const value = 1;',
  }, /must resolve inside src.*docs/],
  ['site dependency', {
    'src/chat/ui/index.ts': "import 'dumi';",
  }, /not declared: dumi/],
  ['host alias', {
    'src/chat/ui/index.ts': "import '@/services/fin-work';",
  }, /not declared: @\/services/],
  ['named context injection', {
    'src/chat/ui/index.ts': "import { useContext as readContext } from 'react';",
  }, /injected through props/],
  ['context provider', {
    'src/chat/ui/index.ts': "import { createContext } from 'react';",
  }, /injected through props/],
  ['namespace context injection', {
    'src/chat/ui/index.ts': "import * as React from 'react'; React.useContext(null);",
  }, /injected through props/],
  ['missing relative module', {
    'src/chat/ui/index.ts': "export * from './missing';",
  }, /must resolve inside src.*missing/],
  ['React subpath in core', {
    'src/chat/core-sse/index.ts': "import 'react/jsx-runtime';",
  }, /core cannot import React/],
  ['type-only React import', {
    'src/chat/core-sse/index.ts': "import type { ReactNode } from 'react'; export type Value = ReactNode;",
  }, /core cannot import React/],
  ['core style import', {
    'src/chat/core-sse/index.ts': "import '../ui/style.less';",
  }, /core cannot import styles/],
  ['transitive UI alias', {
    'src/chat/core-sse/index.ts': "export * from '../shared';",
    'src/chat/shared.ts': "export * from '@lz19.02/finwork-kit/chat/ui';",
    'src/chat/ui/index.ts': 'export const ui = 1;',
  }, /core cannot reach UI/],
  ['transitive browser global', {
    'src/chat/core-sse/index.ts': "export * from '../shared';",
    'src/chat/shared.ts': 'export const title = document.title;',
  }, /Cannot find name 'document'/],
  ['DOM lib reference', {
    'src/chat/core-sse/index.ts': '/// <reference lib="dom" />\nexport const title = document.title;',
  }, /core cannot reference DOM/],
  ['dynamic import', {
    'src/chat/core-sse/index.ts': "export const load = () => import('react-dom');",
  }, /core cannot import React/],
  ['computed dynamic import', {
    'src/chat/ui/index.ts': "export const load = (name: string) => import(name);",
  }, /requires a static string literal/],
  ['declared site dependency', {
    'package.json': JSON.stringify({ name: '@lz19.02/finwork-kit', dependencies: { dumi: '2.4.21' } }),
    'src/chat/ui/index.ts': "import 'dumi';",
  }, /cannot import documentation tooling/],
  ['alias outside src', {
    'tsconfig.json': JSON.stringify({ compilerOptions: {
      target: 'ES2020', moduleResolution: 'Bundler', module: 'ESNext',
      paths: { react: ['./docs/example.ts'] },
    }, include: ['src'] }),
    'src/chat/ui/index.ts': "import 'react';",
    'docs/example.ts': 'export const value = 1;',
  }, /must resolve inside src/],
  ['reference outside src', {
    'src/chat/ui/index.ts': '/// <reference path="../../../docs/types.d.ts" />',
    'docs/types.d.ts': 'declare const siteOnly: string;',
  }, /reference must stay inside src/],
]) {
  test('rejects ' + name, () => {
    assert.match(inspect(files).join('\n'), message);
  });
}

test('reports invalid TypeScript configuration', () => {
  assert.match(inspect({}, { compilerOptions: { target: 'not-a-target' } }).join('\n'), /target/);
});
