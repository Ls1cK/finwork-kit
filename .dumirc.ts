import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'dumi';
import { sourceAliases } from './config/entries';

const logo = `data:image/png;base64,${readFileSync(resolve('docs/assets/brand/finwork-icon.png')).toString('base64')}`;
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

export default defineConfig({
  title: 'FinWork Kit · 组件与 SDK',
  favicons: [logo],
  theme: {
    '@c-primary': '#c8152d',
    '@c-primary-dark': '#ff9aa9',
    '@c-site-bg-dark': '#111318',
    '@c-text-dark': '#edf0f4',
    '@c-text-secondary-dark': '#b6bdc9',
    '@c-text-note-dark': '#8c97a7',
    '@c-border-dark': '#343b47',
    '@c-border-less-dark': '#343b47',
  },
  themeConfig: {
    name: 'FinWork Kit',
    logo,
    nav: [
      { title: '指南', link: '/guide/introduction' },
      { title: '组件', link: '/reference/overview' },
      { title: 'SDK', link: '/sdk/overview' },
    ],
    sidebar: {
      '/guide': [
        { title: '开始使用', children: [
          { title: '介绍', link: '/guide/introduction' },
          { title: '快速开始', link: '/guide/getting-started' },
        ] },
      ],
      '/reference': [{ title: '使用文档', children: [
        { title: '组件总览', link: '/reference/overview' },
        { title: '消息布局', link: '/reference/messages' },
        { title: '消息内容', link: '/reference/content' },
        { title: '子智能体', link: '/reference/subagents' },
        { title: '文件展示', link: '/reference/files' },
        { title: '消息操作', link: '/reference/actions' },
        { title: 'Markdown 与引用', link: '/reference/markdown' },
      ] }],
      '/sdk': [{ title: 'SDK', children: [
        { title: '概览', link: '/sdk/overview' },
      ] }],
    },
    footer: `FinWork Kit v${version} · 为专业任务执行构建一致体验`,
  },
  resolve: { docDirs: ['docs'], atomDirs: [] },
  autoAlias: false,
  alias: sourceAliases,
  outputPath: 'site-dist/uat/oa',
  mfsu: false,
});
