import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function loadCore(entry) {
  const workspace = mkdtempSync(join(tmpdir(), 'finwork-kit-core-test-'));
  after(() => rmSync(workspace, { recursive: true, force: true }));
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir: workspace, emptyOutDir: false,
      lib: { entry: join(root, 'src/chat', entry, 'index.ts'), formats: ['es'], fileName: () => 'core.mjs' },
    },
  });
  return import(pathToFileURL(join(workspace, 'core.mjs')).href);
}
