import {
  AssistantContent, AskUserQuestionContent, ContextCompressContent,
  MessageCollapse, MessageContentItem, MessageContentList, TaskCompletedSplit,
  ThinkContent, ToolCallMsg, ToolCallResponse,
} from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

export default function MessageContents() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h3>MessageContentList · 按类型分发</h3>
      <MessageContentList list={[
        { id: 'think', type: 'THINK_MSG', content: '核对资料并整理重点。' },
        { id: 'tool', type: 'TOOL_CALL', tool_call_name: '搜索会议纪要' },
        { id: 'result', type: 'TOOL_RESPONSE', tool_result_name: 'Bash', output: '找到 3 条相关记录。' },
        { id: 'agents', type: 'SUBAGENTS', subAgentRenderConfig: { subAgentList: [
          { id: 'summary-agent', description: '纪要助手', prompt: '整理会议纪要中的行动项。' },
        ] } },
        { id: 'compress', type: 'CONTEXT_COMPRESS', contextCompressStatus: 'success' },
        { id: 'question', type: 'ASK_USER_QUESTION', question: '是否保留行动项？',
          options: [{ id: 'yes', text: '保留' }], userAnswer: { optionId: 'yes' } },
        { id: 'answer', type: 'ASSISTANT_MSG', content: '**结论**：资料已齐全。' },
      ]} />
      <h3>MessageContentItem · 单条内容</h3>
      <MessageContentItem item={{ id: 'single', type: 'ASSISTANT_MSG', content: '这是一条独立内容。' }} />
      <h3>AssistantContent · 回答正文</h3>
      <AssistantContent content="已生成 **3 项待办**。" />
      <h3>ThinkContent · 思考内容</h3>
      <ThinkContent content="先提取会议中的行动项。" defaultExpanded />
      <h3>ToolCallMsg · 工具调用</h3>
      <ToolCallMsg label="搜索资料" detail="会议纪要" isStreaming />
      <ToolCallMsg label="搜索资料" detail="已找到 3 条相关记录" />
      <h3>ToolCallResponse · 工具结果</h3>
      <ToolCallResponse content="找到 3 条相关记录。" defaultExpanded />
      <h3>TaskCompletedSplit · 过程与结论</h3>
      <TaskCompletedSplit
        title="查看执行过程"
        defaultExpanded
        process={(
          <>
            <ThinkContent content="先提取会议中的行动项。" defaultExpanded />
            <ToolCallMsg label="搜索资料" detail="会议纪要" />
            <ToolCallResponse content="找到 3 条相关记录。" defaultExpanded />
          </>
        )}
        conclusion={<AssistantContent content="已生成 **3 项待办**。" />}
      />
      <h3>ContextCompressContent · 上下文压缩</h3>
      <ContextCompressContent status="unfinished" />
      <ContextCompressContent status="compressing" />
      <ContextCompressContent status="success" />
      <ContextCompressContent status="failed" />
      <h3>AskUserQuestionContent · 回答回显</h3>
      <AskUserQuestionContent
        question="选择交付格式"
        options={[{ id: 'markdown', text: 'Markdown' }, { id: 'word', text: 'Word' }]}
        answer={{ optionId: 'markdown', userMessage: '请保留行动项。' }}
      />
      <h3>MessageCollapse · 折叠面板</h3>
      <MessageCollapse title="补充说明" defaultExpanded>待办已按负责人整理。</MessageCollapse>
    </div>
  );
}
