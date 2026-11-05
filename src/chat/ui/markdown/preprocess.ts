/**
 * Detects incomplete markdown syntax at the end of the string and replaces it
 * with custom component placeholders that markdown-to-jsx can render.
 *
 * 基础预处理：适用于所有 MarkdownViewer 调用方（含 md 文件预览）。
 * 文本文件本身可能是非标准 md（未闭合代码块/链接/代码/HTML 标签），
 * 统一在此补齐或剔除，避免被当作真实 HTML 解析造成 XSS / 渲染错乱。
 */
export const preprocessMarkdown = (rawContent: string): string => {
  if (typeof rawContent !== 'string') return '';
  if (!rawContent) return rawContent;

  const content = rawContent;

  // 0. Unclosed fenced code block (```)
  // 打开 ``` 到了但 closing ``` 还没到，
  // markdown-to-jsx 会把代码内容当作真实 HTML 解析，
  // 导致 React 报错和 XSS 风险。检测到未闭合时自动补上 closing ```。
  const fenceCount = countCodeFences(content);
  if (fenceCount % 2 !== 0) {
    // 末尾可能是一个正在输入的不完整行（如 ``` 的开头 `` 或语言标识正在输入）
    // 直接在末尾补一个换行 + ``` 即可让 markdown-to-jsx 将内容识别为代码块
    return content + '\n```';
  }

  // 1. Incomplete Image: ![alt](url... or ![alt]... or ![...
  // Regex to detect partial image at the end
  if (/!\[[^\]]*\]?\([^)]*$/.test(content) || /!\[[^\]]*$/.test(content)) {
    // Remove the partial syntax
    return content.replace(/!\[[^\]]*\]?(\([^)]*)?$/, '');
  }

  // 2. Incomplete Link: [text](url... or [text]...
  // Be careful not to match simple text in brackets if it's not meant to be a link,
  // but in streaming context, [text](... at the end is likely a link.
  if (/\[[^\]]*\]\([^)]*$/.test(content)) {
    return content.replace(/\[[^\]]*\]\([^)]*$/, '');
  }

  // 3. Incomplete Code Block (Inline): `code...
  // Check for odd number of backticks?
  const backtickCount = (content.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0 && /`[^`]*$/.test(content)) {
    return content.replace(/`[^`]*$/, '');
  }

  // 4. Incomplete Table: Line starts with |
  // If the last line starts with | but doesn't end with it, or looks like a partial row

  // 表格暂时不处理，有加载行的一半内容又隐藏的问题
  // const lines = content.split('\n');
  // const lastLine = lines[lines.length - 1];
  // if (lastLine.trim().startsWith('|') && !lastLine.trim().endsWith('|')) {
  //   lines.pop();
  //   return lines.join('\n');
  // }

  // 5. Incomplete HTML: <div... or <span... but not closed
  if (/<[a-zA-Z][^>]*$/.test(content)) {
    return content.replace(/<[a-zA-Z][^>]*$/, '');
  }

  return content;
};

/**
 * 流式对话专属的额外预处理：在基础 preprocessMarkdown 之前执行（先补全/转移，
 * 再交给统一的基础兜底，避免基础 Incomplete Link 规则误删引用锚点残句）。
 * 仅 StreamingMarkdownRenderer 注入使用，通用 md 渲染（文件预览等）不需要。
 */
export const preprocessStreamingExtra = (rawContent: string): string => {
  if (typeof rawContent !== 'string') return '';
  if (!rawContent) return rawContent;

  let content = rawContent;

  // 2a. Incomplete REFERENCE Anchor: [来源](#ref:news_search ... 未闭合
  // 流式对话中引用锚点逐步累积，残句若落入通用 Incomplete Link 规则会被整体删除，
  // 造成下一帧补全后又出现 → 闪烁。这里对末尾引用残句自动补 )，稳定渲染为 <a href="#ref:...">。
  // 完整锚点（含收尾 )）由渲染层（ReferenceAnchor / a override）进一步替换为 [idx]。
  if (/\[来源\]\(#[^)]*$/.test(content)) {
    return content + ')';
  }

  // 6. 保护 **mcp__{server}__{tool}**，防止内部 __ 被解析为强调
  // 用 (?!\w*__) 否定前瞻确保第二个 __ 之后没有更多 __ 段
  content = content.replace(/\*\*mcp__\w+__(?!\w*__)\w+\*\*/g, (match) =>
    match.replace(/__/g, '\\_\\_'),
  );
  return content;
};

/**
 * 流式对话完整预处理：额外逻辑（引用锚点补全、mcp 保护）先行，再叠加基础兜底。
 * 供 StreamingMarkdownRenderer 直接调用，避免外部再手动串联。
 */
export const preprocessStreamingMarkdown = (rawContent: string): string =>
  preprocessMarkdown(preprocessStreamingExtra(rawContent));

/**
 * 统计围栏代码块的 fence 数量（行首 ``` 开头的行）。
 * 奇数表示有一个未闭合的代码块。
 */
function countCodeFences(content: string): number {
  let count = 0;
  const lines = content.split('\n');
  for (const line of lines) {
    // 围栏代码块的 fence：行首可选空格(0-3) + 至少三个反引号
    if (/^ {0,3}`{3,}/.test(line)) {
      count++;
    }
  }
  return count;
}
