declare module 'highlightjs-vue' {
  import type { HLJSApi } from 'highlight.js';
  export default function registerVue(highlight: HLJSApi): void;
}
