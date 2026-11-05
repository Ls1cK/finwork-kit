import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { libraryEntries, projectRoot } from './config/entries';

export default defineConfig({
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: !process.argv.includes('--watch'),
    lib: {
      entry: libraryEntries,
      formats: ['es'],
      fileName: (_format, entryName) => entryName + '.js',
      cssFileName: 'chat-ui',
    },
    rollupOptions: {
      external: (id) =>
        ['ahooks', 'highlight.js', 'highlightjs-vue', 'markdown-to-jsx', 'yaml'].some(
          (name) => id === name || id.startsWith(name + '/'),
        ) ||
        id === 'antd' ||
        id.startsWith('antd/') ||
        id === '@ant-design/icons' ||
        id.startsWith('@ant-design/icons/') ||
        id === 'react' ||
        id.startsWith('react/') ||
        id === 'react-dom' ||
        id.startsWith('react-dom/'),
    },
  },
});
