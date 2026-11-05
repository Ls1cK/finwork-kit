import type { HLJSApi } from 'highlight.js';

let hljsInstance: HLJSApi | null = null;

const languageAliases: Record<string, string> = {
  jsx: 'javascript',
  tsx: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
};

function normalizeHighlightLanguage(language: string): string {
  const normalizedLanguage = language.trim().toLowerCase();
  return languageAliases[normalizedLanguage] || normalizedLanguage || 'plaintext';
}

export const escapeHtml = (html: string): string => {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export async function highlightCodeSnippet(code: string, language: string): Promise<string> {
  if (!hljsInstance) {
    const hljsModule = await import('highlight.js/lib/core');
    hljsInstance = hljsModule.default;
  }

  const highlightLanguage = normalizeHighlightLanguage(language);
  await loadLanguage(highlightLanguage);

  if (highlightLanguage === 'plaintext' || !hljsInstance.getLanguage(highlightLanguage)) {
    return escapeHtml(code);
  }

  const result = hljsInstance.highlight(code, { language: highlightLanguage });
  return result.value;
}

async function loadLanguage(lang: string): Promise<void> {
  try {
    if (!hljsInstance) return;

    if (lang === 'plaintext' || hljsInstance.getLanguage(lang)) {
      return;
    }

    if (lang === 'vue') {
      await Promise.all([loadLanguage('xml'), loadLanguage('javascript'), loadLanguage('css')]);

      const { default: hljsDefineVue } = await import('highlightjs-vue');
      hljsDefineVue(hljsInstance);

      return;
    }

    const languageModules: Record<string, () => Promise<unknown>> = {
      javascript: () => import('highlight.js/lib/languages/javascript'),
      typescript: () => import('highlight.js/lib/languages/typescript'),
      java: () => import('highlight.js/lib/languages/java'),
      python: () => import('highlight.js/lib/languages/python'),
      xml: () => import('highlight.js/lib/languages/xml'),
      css: () => import('highlight.js/lib/languages/css'),
      less: () => import('highlight.js/lib/languages/less'),
      scss: () => import('highlight.js/lib/languages/scss'),
      json: () => import('highlight.js/lib/languages/json'),
      yaml: () => import('highlight.js/lib/languages/yaml'),
      ini: () => import('highlight.js/lib/languages/ini'),
      properties: () => import('highlight.js/lib/languages/ini'),
      sql: () => import('highlight.js/lib/languages/sql'),
      bash: () => import('highlight.js/lib/languages/bash'),
      php: () => import('highlight.js/lib/languages/php'),
      go: () => import('highlight.js/lib/languages/go'),
      rust: () => import('highlight.js/lib/languages/rust'),
      c: () => import('highlight.js/lib/languages/c'),
      cpp: () => import('highlight.js/lib/languages/cpp'),
      csharp: () => import('highlight.js/lib/languages/csharp'),
      ruby: () => import('highlight.js/lib/languages/ruby'),
      swift: () => import('highlight.js/lib/languages/swift'),
      kotlin: () => import('highlight.js/lib/languages/kotlin'),
      markdown: () => import('highlight.js/lib/languages/markdown'),
    };

    const loader = languageModules[lang];
    if (loader) {
      const module = (await loader()) as { default: Parameters<HLJSApi['registerLanguage']>[1] };
      hljsInstance.registerLanguage(lang, module.default);
    }
  } catch {
    console.warn(`Failed to load language: ${lang}, falling back to plaintext`);
  }
}
