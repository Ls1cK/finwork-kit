import { useState } from 'react';
import { MessageContentList, getContentKey, getContentCollapseKey } from '@lz19.02/finwork-kit/chat/ui';
import type { MessageContent, MessageContentRenderers } from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

interface BusinessContent extends MessageContent {
  auditLabel?: string;
}

const list: BusinessContent[] = [
  { id: 'think', type: 'THINK_MSG', content: '核对全部资料后生成结论。' },
  { id: 'answer', type: 'ASSISTANT_MSG', content: '**正文**沿用默认 Markdown 渲染。' },
  { id: 'audit', type: 'AUDIT_NOTICE', auditLabel: '人工复核已完成' },
  { id: 'unknown', type: 'BUSINESS_NOTICE', content: '这条业务通知使用未知类型回退。' },
];

const renderers: MessageContentRenderers<BusinessContent> = {
  AUDIT_NOTICE: ({ item }) => <p role="status">{item.auditLabel}</p>,
};

export default function ContentExtension() {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({
    [getContentCollapseKey(list[0])]: true,
  });
  return (
    <MessageContentList
      list={list}
      renderers={renderers}
      getItemKey={getContentKey}
      conclusionId="answer"
      defaultProcessExpanded
      contentExpandedMap={expandedMap}
      onContentExpandedChange={(key, expanded) => setExpandedMap((current) => ({ ...current, [key]: expanded }))}
      renderUnknown={({ item }) => <p>{item.content}</p>}
      renderItem={({ item }, defaultContent) => (
        <section data-content-id={item.id}>{defaultContent}</section>
      )}
    />
  );
}
