export interface ReferenceContent {
  id?: string;
  msg_content_id?: string;
  type?: string;
  content?: string;
}

/** 引用锚点正则会提取的 referenceId（形如 news_search:1） */
const REFERENCE_ANCHOR_RE = /\[来源\]\(#ref:([^)]+)\)/g;

/** 一条引用锚点：referenceId + 该锚点分配的展示下标 idx */
export interface MessageReferenceAnchor {
  referenceId: string;
  idx: number;
}

/** 从一条文本中提取所有完整引用锚点的 referenceId，按出现顺序返回。 */
export const extractRefIdsFromText = (text: string): string[] => {
  if (typeof text !== 'string') return [];
  REFERENCE_ANCHOR_RE.lastIndex = 0;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = REFERENCE_ANCHOR_RE.exec(text))) {
    ids.push(match[1]);
  }
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

/** 把文本中的 `[来源](#ref:ID)` 逐个替换为 `[idx](#ref:ID)`，与 anchors（该消息内按出现序）对齐 */
export const replaceRefAnchorsWithIdx = (
  text: string,
  anchors: MessageReferenceAnchor[],
): string => {
  if (anchors.length === 0) return text;
  REFERENCE_ANCHOR_RE.lastIndex = 0;
  let index = 0;
  return text.replace(/\[来源\]\(#ref:([^)]+)\)/g, (match, referenceId) => {
    const anchor = anchors[index];
    index += 1;
    if (!anchor || anchor.referenceId !== referenceId) return match;
    return `[${anchor.idx}](#ref:${referenceId})`;
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
