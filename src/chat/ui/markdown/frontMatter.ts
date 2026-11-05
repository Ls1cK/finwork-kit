import YAML from 'yaml';

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface FrontMatterResult {
  meta: Record<string, unknown>;
  content: string;
}

/**
 * 解析并剥离 YAML front matter（以 --- 包裹的头部元数据块）。
 * 只在内容开头匹配，避免误伤文档中作为 <hr> 的 ---。
 */
export function extractFrontMatter(rawContent: string): FrontMatterResult {
  if (typeof rawContent !== 'string') return { meta: {}, content: '' };
  if (!rawContent) return { meta: {}, content: rawContent };

  const match = rawContent.match(FRONT_MATTER_REGEX);
  if (!match) return { meta: {}, content: rawContent };

  let meta: Record<string, unknown> = {};
  try {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === 'object') {
      meta = parsed as Record<string, unknown>;
    }
  } catch {
    // 解析失败时静默忽略
  }

  return { meta, content: rawContent.replace(FRONT_MATTER_REGEX, '') };
}
