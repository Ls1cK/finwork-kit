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
const { ChatExample } = await import('@lz19.02/finwork-kit/chat/ui');
assert.equal(testCoreSse(), 'core-sse:ok');
assert.equal(testCoreDetail(), 'core-detail:ok');
assert.match(renderToStaticMarkup(createElement(ChatExample, { title: 'Consumer UI' })), /Consumer UI/);
assert.ok(readFileSync(join(root, 'dist/chat-ui.css'), 'utf8').length > 0);

const isolated = mkdtempSync(join(tmpdir(), 'finwork-kit-core-'));
try {
  cpSync(join(root, 'dist'), join(isolated, 'dist'), { recursive: true });
  writeFileSync(join(isolated, 'package.json'), JSON.stringify(manifest));
  const sse = pathToFileURL(join(isolated, 'dist/chat/core-sse.js')).href;
  const detail = pathToFileURL(join(isolated, 'dist/chat/core-detail.js')).href;
  const check = [
    "import assert from 'node:assert/strict';",
    'import { testCoreSse } from ' + JSON.stringify(sse) + ';',
    'import { testCoreDetail } from ' + JSON.stringify(detail) + ';',
    "assert.equal(testCoreSse(), 'core-sse:ok');",
    "assert.equal(testCoreDetail(), 'core-detail:ok');",
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
