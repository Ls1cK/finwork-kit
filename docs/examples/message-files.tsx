import { useState } from 'react';
import { MessageFileCard, MessageFileList, OutputFilesCollapse, SkillOutputCard } from '@lz19.02/finwork-kit/chat/ui';
import type { MessageFile } from '@lz19.02/finwork-kit/chat/ui';
import '@lz19.02/finwork-kit/chat/style.css';

const files: MessageFile[] = [{ fileId: 'minutes', fileName: '会议纪要.md' }];

export default function MessageFiles() {
  const [action, setAction] = useState('点击预览或下载，查看回调收到的文件。');
  const preview = (file: MessageFile) => setAction(`请求预览 ${file.fileName}`);
  const download = (file: MessageFile) => setAction(`请求下载 ${file.fileName}`);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <MessageFileCard file={files[0]} onPreview={preview} onDownload={download} />
      <MessageFileList files={files} onPreview={preview} />
      <SkillOutputCard file={{ fileName: '纪要生成技能.zip' }} isSkillDebugTask onDownload={download} />
      <OutputFilesCollapse
        outputFiles={files} packageFile={{ fileName: '本轮文件.zip' }}
        skillFiles={[{ fileId: 'skill', fileName: '纪要生成技能.zip' }]}
        onPreviewSkill={preview}
        onPreviewAll={() => setAction('请求查看本轮所有文件')} onDownload={download}
      />
      <h3>下载中</h3>
      <MessageFileCard file={files[0]} downloading onDownload={download} />
      <small role="status">{action}</small>
    </div>
  );
}
