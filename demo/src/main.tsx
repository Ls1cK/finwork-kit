import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { testCoreSse } from 'finwork-kit/chat/core-sse';
import { testCoreDetail } from 'finwork-kit/chat/core-detail';
import { ChatExample } from 'finwork-kit/chat/ui';
import 'finwork-kit/chat/style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Demo root element is missing');

createRoot(root).render(
  <StrictMode>
    <main style={{ maxWidth: 760, margin: '48px auto', padding: '0 20px' }}>
      <h1>FinWork Kit Demo</h1>
      <p>core-sse: {testCoreSse()}</p>
      <p>core-detail: {testCoreDetail()}</p>
      <ChatExample title="Chat UI 接入示例" />
    </main>
  </StrictMode>,
);
