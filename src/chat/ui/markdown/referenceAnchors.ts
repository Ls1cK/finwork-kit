export interface ReferenceContent {
  id?: string;
  msg_content_id?: string;
  type?: string;
  content?: string;
}

/** 引用锚点正则会提取的 referenceId（形如 news_search:1）。
 * LLM 偶发混用中英文符号，按「左括号 来源 右括号 左括号 #ref 分隔符 ID 右括号」宽松匹配：
 * 左括号 `(（【[`、右括号 `)）]】` 任意组合，分隔符 `:`、`：`、`=`。
 * referenceId 禁止空白、括号、引号/反引号及常见句读标点，防止未闭合的残缺引用跨行/跨段或跨标点吞掉后续正常引用；
 * referenceId 内的全角冒号归一化为半角。 */
export const REFERENCE_ID_CHAR_SOURCE = '[^\\s[\\]()（）<>`"\'，。；！？、】【“”‘’,;!?]';
export const REFERENCE_LEFT_SOURCE = '[(（【\\[]';
export const REFERENCE_RIGHT_SOURCE = '[)）\\]】]';
/** 部分模型会在引用末尾多输出一个右括号，匹配时将它一并视为引用的一部分。 */
export const REFERENCE_TAIL_SOURCE = `${REFERENCE_RIGHT_SOURCE}${REFERENCE_RIGHT_SOURCE}?`;
export const REFERENCE_ANCHOR_SOURCE =
  `${REFERENCE_LEFT_SOURCE}来源${REFERENCE_RIGHT_SOURCE}${REFERENCE_LEFT_SOURCE}#ref[:=：](${REFERENCE_ID_CHAR_SOURCE}+)${REFERENCE_TAIL_SOURCE}`;

export const normalizeRefId = (referenceId: string): string => referenceId.replace(/：/g, ':');

/** 一条引用锚点：referenceId + 该锚点分配的展示下标 idx */
export interface MessageReferenceAnchor {
  referenceId: string;
  idx: number;
}

export function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function findClosingTicks(text: string, from: number, limit: number, tickLen: number): number {
  let search = from;
  while (search < limit) {
    const nextTick = text.indexOf('`', search);
    if (nextTick === -1 || nextTick >= limit) break;
    let runEnd = nextTick + 1;
    while (runEnd < limit && text[runEnd] === '`') runEnd += 1;
    if (runEnd - nextTick === tickLen) return runEnd;
    search = runEnd;
  }
  return -1;
}

function mapInlineNonCode(block: string, transform: (prose: string) => string): string {
  if (!block.includes('`')) return transform(block);
  const blankLineRe = /\r?\n[ \t]*\r?\n/g;
  const failedLens = new Set<number>();
  let paraEnd = -1;
  let out = '';
  let proseStart = 0;
  let cursor = 0;

  while (cursor < block.length) {
    const tickStart = block.indexOf('`', cursor);
    if (tickStart === -1) break;
    if (isEscaped(block, tickStart)) {
      cursor = tickStart + 1;
      continue;
    }
    let tickEnd = tickStart + 1;
    while (tickEnd < block.length && block[tickEnd] === '`') tickEnd += 1;
    const tickLen = tickEnd - tickStart;

    if (tickEnd > paraEnd) {
      blankLineRe.lastIndex = tickEnd;
      const blankMatch = blankLineRe.exec(block);
      paraEnd = blankMatch ? blankMatch.index : block.length;
      failedLens.clear();
    }

    if (failedLens.has(tickLen)) {
      cursor = tickEnd;
      continue;
    }

    const closeEnd = findClosingTicks(block, tickEnd, paraEnd, tickLen);
    if (closeEnd !== -1) {
      if (tickStart > proseStart) out += transform(block.slice(proseStart, tickStart));
      out += block.slice(tickStart, closeEnd);
      proseStart = closeEnd;
      cursor = closeEnd;
    } else {
      failedLens.add(tickLen);
      cursor = tickEnd;
    }
  }

  if (proseStart < block.length) out += transform(block.slice(proseStart));
  return out;
}

function scanFences(
  text: string,
  onProseChunk?: (chunk: string) => void,
  onCodeChunk?: (chunk: string) => void,
): { proseStart: number; fence?: { char: '`' | '~'; len: number; quoteDepth: number } } {
  let lineStart = 0;
  let proseStart = 0;
  let quoteDepth = 0;
  let fence: { char: '`' | '~'; len: number; quoteDepth: number } | undefined;

  while (lineStart < text.length) {
    let lineEnd = text.indexOf('\n', lineStart);
    const nextLineStart = lineEnd === -1 ? text.length : lineEnd + 1;
    if (lineEnd === -1) lineEnd = text.length;
    else if (lineEnd > lineStart && text[lineEnd - 1] === '\r') lineEnd -= 1;

    let rest = text.slice(lineStart, lineEnd);
    if (rest.includes('\t')) rest = rest.replace(/\t/g, '    ');

    let matchedExisting = 0;
    while (matchedExisting < quoteDepth) {
      if (rest === '') {
        quoteDepth = matchedExisting;
        if (fence && fence.quoteDepth > quoteDepth) {
          onCodeChunk?.(text.slice(proseStart, lineStart));
          fence = undefined;
          proseStart = lineStart;
        }
        break;
      }
      const m = /^ *> ?/.exec(rest);
      if (!m) break;
      rest = rest.slice(m[0].length);
      matchedExisting += 1;
    }

    if (!fence && matchedExisting === quoteDepth) {
      let openQuote: RegExpExecArray | null;
      while ((openQuote = /^ {0,3}> ?/.exec(rest))) {
        quoteDepth += 1;
        rest = rest.slice(openQuote[0].length);
      }
    }

    if (!fence) {
      const openMatch = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(rest);
      if (openMatch && (openMatch[1][0] === '~' || !openMatch[2].includes('`'))) {
        if (lineStart > proseStart) onProseChunk?.(text.slice(proseStart, lineStart));
        fence = { char: openMatch[1][0] as '`' | '~', len: openMatch[1].length, quoteDepth };
        proseStart = lineStart;
      }
    } else {
      const closeMatch = /^(?: *> ?)* *(`{3,}|~{3,}) *$/.exec(rest);
      if (closeMatch && closeMatch[1][0] === fence.char && closeMatch[1].length >= fence.len) {
        onCodeChunk?.(text.slice(proseStart, nextLineStart));
        fence = undefined;
        proseStart = nextLineStart;
      }
    }

    lineStart = nextLineStart;
  }

  return { proseStart, fence };
}

/** 对 Markdown 中围栏代码块与行内代码之外的正文片段执行转换。 */
export function mapNonCodeMarkdown(text: string, transform: (prose: string) => string): string {
  let out = '';
  const { proseStart, fence } = scanFences(
    text,
    (chunk) => { out += mapInlineNonCode(chunk, transform); },
    (chunk) => { out += chunk; },
  );

  if (proseStart < text.length) {
    const tail = text.slice(proseStart);
    out += fence ? tail : mapInlineNonCode(tail, transform);
  }
  return out;
}

/** 识别末尾未闭合的围栏代码块、最后一行未闭合的行内代码及最后一个已闭合代码的结束偏移。 */
export function scanTrailingUnclosedCode(text: string): {
  unclosedFence?: string;
  unclosedInlineIndex: number;
  lastCodeEnd: number;
} {
  const { proseStart, fence } = scanFences(text);
  if (fence) {
    return {
      unclosedFence: `${'> '.repeat(fence.quoteDepth)}${fence.char.repeat(fence.len)}`,
      unclosedInlineIndex: -1,
      lastCodeEnd: text.length,
    };
  }

  let lastCodeEnd = proseStart;
  const tail = text.slice(proseStart);
  if (!tail.includes('`')) return { unclosedInlineIndex: -1, lastCodeEnd };

  const blankLineRe = /\r?\n[ \t]*\r?\n/g;
  const failedLens = new Set<number>();
  let paraEnd = -1;
  let cursor = 0;

  while (cursor < tail.length) {
    const tickStart = tail.indexOf('`', cursor);
    if (tickStart === -1) break;
    if (isEscaped(tail, tickStart)) {
      cursor = tickStart + 1;
      continue;
    }
    let tickEnd = tickStart + 1;
    while (tickEnd < tail.length && tail[tickEnd] === '`') tickEnd += 1;
    const tickLen = tickEnd - tickStart;

    if (tickEnd > paraEnd) {
      blankLineRe.lastIndex = tickEnd;
      const blankMatch = blankLineRe.exec(tail);
      paraEnd = blankMatch ? blankMatch.index : tail.length;
      failedLens.clear();
    }

    if (!failedLens.has(tickLen)) {
      const closeEnd = findClosingTicks(tail, tickEnd, paraEnd, tickLen);
      if (closeEnd !== -1) {
        lastCodeEnd = proseStart + closeEnd;
        cursor = closeEnd;
        continue;
      }
      failedLens.add(tickLen);
    }

    if (tail.indexOf('\n', tickStart) === -1) {
      return { unclosedInlineIndex: proseStart + tickStart, lastCodeEnd };
    }
    cursor = tickEnd;
  }

  return { unclosedInlineIndex: -1, lastCodeEnd };
}

/** 从一条文本中提取所有完整引用锚点的 referenceId，按出现顺序返回（跳过代码块与已转义标记）。 */
export const extractRefIdsFromText = (text: string): string[] => {
  if (typeof text !== 'string' || !text) return [];
  const ids: string[] = [];
  mapNonCodeMarkdown(text, (prose) => {
    const pattern = new RegExp(REFERENCE_ANCHOR_SOURCE, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prose))) {
      if (!isEscaped(prose, match.index)) {
        ids.push(normalizeRefId(match[1]));
      }
    }
    return prose;
  });
  return ids;
};

/**
 * 基于一轮 assistant Message 的 contentList，计算该轮全部引用锚点的展示下标。
 * idx 按「引用锚点在整轮回答文本中的出现先后」从 1 累计；
 * 同一 referenceId 出现多次各占一个独立 idx（与 reference_id 内部数字无关）。
 */
export const buildRoundRefAnchors = (
  contentList: readonly ReferenceContent[] | undefined,
): MessageReferenceAnchor[] => {
  const anchors: MessageReferenceAnchor[] = [];
  let idx = 0;
  for (const item of contentList ?? []) {
    if (!item || item.type !== 'ASSISTANT_MSG' || !item.content) continue;
    for (const referenceId of extractRefIdsFromText(item.content)) {
      idx += 1;
      anchors.push({ referenceId, idx });
    }
  }
  return anchors;
};

/** 把非代码且未转义正文中的 `[来源](#ref:ID)` 逐个替换为 `[idx](#ref:ID)`，与 anchors（该消息内按出现序）对齐 */
export const replaceRefAnchorsWithIdx = (
  text: string,
  anchors: MessageReferenceAnchor[],
): string => {
  if (typeof text !== 'string' || !text || anchors.length === 0) return text;
  let index = 0;
  return mapNonCodeMarkdown(text, (prose) => {
    const pattern = new RegExp(REFERENCE_ANCHOR_SOURCE, 'g');
    return prose.replace(pattern, (match, rawReferenceId: string, offset: number) => {
      if (isEscaped(prose, offset)) return match;
      const referenceId = normalizeRefId(rawReferenceId);
      const anchor = anchors[index];
      index += 1;
      if (!anchor || anchor.referenceId !== referenceId) return match;
      return `[${anchor.idx}](#ref:${referenceId})`;
    });
  });
};

/**
 * 把一轮 message 的 contentList 中全部引用锚点，按所属 ASSISTANT_MSG 的 msg_content_id 分组。
 * 每条 ASSISTANT_MSG 拿到自己内部按出现序的锚点子序列（用于 replaceRefAnchorsWithIdx）。
 */
export const buildRefAnchorsByContentId = (
  contentList: readonly ReferenceContent[] | undefined,
): Record<string, MessageReferenceAnchor[]> => {
  const result: Record<string, MessageReferenceAnchor[]> = {};
  let idx = 0;
  for (const item of contentList ?? []) {
    if (!item || item.type !== 'ASSISTANT_MSG' || !item.content) continue;
    const own: MessageReferenceAnchor[] = [];
    for (const referenceId of extractRefIdsFromText(item.content)) {
      idx += 1;
      own.push({ referenceId, idx });
    }
    if (own.length > 0) {
      const key = item.msg_content_id || item.id;
      if (key) result[key] = own;
    }
  }
  return result;
};
