import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'dumi';
import { sourceAliases } from './config/entries';

const logo = `data:image/png;base64,${readFileSync(resolve('docs/assets/brand/finwork-icon.png')).toString('base64')}`;

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
      { title: '组件与 SDK', link: '/reference/overview' },
      { title: '协议接入', link: '/protocol/integration' },
    ],
    sidebar: {
      '/guide': [
        { title: '开始使用', children: [
          { title: '介绍', link: '/guide/introduction' },
          { title: '快速开始', link: '/guide/getting-started' },
        ] },
      ],
      '/reference': [{ title: '使用文档', children: [
        { title: '组件与 SDK', link: '/reference/overview' },
      ] }],
      '/protocol': [{ title: '协议接入', children: [
        { title: '接入指引', link: '/protocol/integration' },
      ] }],
    },
    footer: 'FinWork Kit · 为专业任务执行构建一致体验',
  },
  resolve: { docDirs: ['docs'], atomDirs: [] },
  autoAlias: false,
  alias: sourceAliases,
  outputPath: 'site-dist/uat/oa',
  mfsu: false,
});
