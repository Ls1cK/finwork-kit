import { defineConfig } from 'dumi';
import { sourceAliases } from './config/entries';

export default defineConfig({
  title: 'FinWork Kit',
  themeConfig: { name: 'FinWork Kit' },
  resolve: { docDirs: ['docs'], atomDirs: [] },
  autoAlias: false,
  alias: sourceAliases,
  outputPath: 'site-dist',
  mfsu: false,
});
