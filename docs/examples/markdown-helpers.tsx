import {
  buildRefAnchorsByContentId, buildRoundRefAnchors, extractFrontMatter,
  extractRefIdsFromText, preprocessMarkdown, preprocessStreamingExtra,
  preprocessStreamingMarkdown, replaceRefAnchorsWithIdx,
} from '@lz19.02/finwork-kit/chat/ui';

const content = '会议结论。[来源](#ref:minutes)行动项。[来源](#ref:minutes)';
const list = [{ id: 'answer', type: 'ASSISTANT_MSG', content }];
const anchors = buildRefAnchorsByContentId(list);
const results = {
  extractRefIdsFromText: extractRefIdsFromText(content),
  buildRoundRefAnchors: buildRoundRefAnchors(list),
  buildRefAnchorsByContentId: anchors,
  replaceRefAnchorsWithIdx: replaceRefAnchorsWithIdx(content, anchors.answer),
  extractFrontMatter: extractFrontMatter('---\ntitle: 会议纪要\n---\n会议正文'),
  preprocessMarkdown: preprocessMarkdown('```ts\nconst done = true;'),
  preprocessStreamingExtra: preprocessStreamingExtra('[来源](#ref:minutes'),
  preprocessStreamingMarkdown: preprocessStreamingMarkdown('**mcp__docs__search**'),
};

export default function MarkdownHelpers() {
  return <pre>{JSON.stringify(results, null, 2)}</pre>;
}
