import { useState } from 'react';
import { Button } from 'antd';
import {
  CodeViewer, MarkdownCodeBlock, MarkdownViewer, ReferenceAnchor,
  StreamingMarkdownRenderer, StreamingTextRenderer, buildRefAnchorsByContentId,
} from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

const answer = { id: 'answer', type: 'ASSISTANT_MSG', content: '会议资料已归档。[来源](#ref:minutes)' };
const anchors = buildRefAnchorsByContentId([answer]);
const chunks = ['## 工作清单\n\n', '- 整理纪要\n', '- 分配待办\n', '\n**已完成整理。**'];

export default function MarkdownDemo() {
  const [chunkCount, setChunkCount] = useState(1);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <MarkdownViewer content={'## 工作清单\n\n- 整理纪要\n- 分配待办'} />
      <h3>累积流式内容</h3>
      <Button size="small" disabled={chunkCount === chunks.length} onClick={() => setChunkCount((count) => count + 1)}>追加下一段</Button>
      <Button size="small" onClick={() => setChunkCount(1)}>重新开始</Button>
      <StreamingMarkdownRenderer content={chunks.slice(0, chunkCount).join('')} isStreaming={chunkCount < chunks.length} />
      <h3>Front matter 元数据</h3>
      <MarkdownViewer content={'---\ntitle: 会议纪要\nauthor: 会议助手\n---\n正文不包含元数据。'} onMeta={setMeta} />
      <pre>{JSON.stringify(meta, null, 2)}</pre>
      <h3>引用来源（悬浮或聚焦编号查看，支持分页）</h3>
      <StreamingMarkdownRenderer
        content={answer.content} refAnchors={anchors.answer}
        renderReference={(anchor) => (
          <ReferenceAnchor anchor={anchor} title="会议资料" contents={[
            { title: '项目周会纪要', content: '本周完成事项与下一步计划。', source: '会议记录', publishedAt: '2026-11-05' },
            { title: '行动项清单', content: '负责人和截止日期已确认。', source: '项目资料', publishedAt: '2026-11-05' },
          ]} />
        )}
      />
      <StreamingTextRenderer content="正在整理行动项……" isStreaming />
      <MarkdownCodeBlock code={'const completed = true;'} language="typescript" />
      <CodeViewer content={'const title = "会议纪要";'} language="typescript" />
    </div>
  );
}
