import { resolve } from 'node:path';

export const projectRoot = process.cwd();

export const libraryEntries = {
  'chat/core-sse': resolve(projectRoot, 'src/chat/core-sse/index.ts'),
  'chat/core-detail': resolve(projectRoot, 'src/chat/core-detail/index.ts'),
  'chat/ui': resolve(projectRoot, 'src/chat/ui/index.ts'),
};

export const sourceAliases = {
  ...Object.fromEntries(
    Object.entries(libraryEntries).map(([entry, source]) => ['finwork-kit/' + entry, source]),
  ),
  'finwork-kit/chat/style.css': resolve(projectRoot, 'src/chat/ui/styles.module.less'),
};
