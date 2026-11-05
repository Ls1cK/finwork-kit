import { Fragment, type ReactNode } from 'react';
import { DownloadOutlined, EyeOutlined, FileOutlined, FolderFilled } from '@ant-design/icons';
import { MessageActions, type MessageAction } from './Actions';
import type { MessageAppearanceProps, MessageFile } from './types';
import styles from './message.module.less';

export interface MessageFileCardProps<T extends MessageFile = MessageFile> extends MessageAppearanceProps {
  file: T;
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  onPreview?: (file: T) => void;
  onDownload?: (file: T) => void;
  downloading?: boolean;
}

export function MessageFileCard<T extends MessageFile>({
  file, title, icon = <FileOutlined />, actions, onPreview, onDownload, downloading,
  className, style,
}: MessageFileCardProps<T>) {
  const fileActions: MessageAction[] = [];
  if (onPreview) fileActions.push({ key: 'preview', label: '预览文件', icon: <EyeOutlined />, onClick: () => onPreview(file) });
  if (onDownload) fileActions.push({ key: 'download', label: '下载文件', icon: <DownloadOutlined />, loading: downloading, onClick: () => onDownload(file) });
  return (
    <div className={`${styles.fileCard} ${className ?? ''}`} style={style}>
      <span className={styles.fileIcon}>{icon}</span>
      <span className={styles.fileTitle} title={file.fileName}>{title ?? file.fileName}</span>
      <MessageActions actions={fileActions}>{actions}</MessageActions>
    </div>
  );
}

export interface SkillOutputCardProps<T extends MessageFile = MessageFile> extends MessageFileCardProps<T> {
  isSkillDebugTask?: boolean;
}

export function SkillOutputCard<T extends MessageFile>({ isSkillDebugTask, icon, className, ...props }: SkillOutputCardProps<T>) {
  return <MessageFileCard {...props} className={`${isSkillDebugTask ? styles.skillDebugOutputCard : ''} ${className ?? ''}`} icon={icon ?? (isSkillDebugTask ? <FolderFilled /> : <FileOutlined />)} />;
}

export interface MessageFileListProps<T extends MessageFile = MessageFile> extends MessageAppearanceProps {
  files: readonly T[];
  label?: string;
  getFileKey?: (file: T) => string;
  renderFile?: (file: T, index: number) => ReactNode;
  onPreview?: (file: T) => void;
}

export function MessageFileList<T extends MessageFile>({
  files, label = '上传文件', getFileKey = (file) => file.fileId ?? file.fileName,
  renderFile, onPreview, className, style,
}: MessageFileListProps<T>) {
  if (files.length === 0) return null;
  return (
    <section className={`${styles.fileList} ${className ?? ''}`} style={style} aria-label={label}>
      {files.map((file, index) => (
        <Fragment key={getFileKey(file)}>
          {renderFile ? renderFile(file, index) : <MessageFileCard file={file} onPreview={onPreview} />}
        </Fragment>
      ))}
    </section>
  );
}

export interface OutputFilesCollapseProps<T extends MessageFile = MessageFile> extends MessageAppearanceProps {
  outputFiles: readonly T[];
  skillFiles?: readonly T[];
  packageFile?: T;
  downloading?: boolean;
  title?: ReactNode;
  getFileKey?: (file: T) => string;
  renderSkill?: (file: T, index: number) => ReactNode;
  onPreviewAll?: () => void;
  onPreviewSkill?: (file: T) => void;
  onDownload?: (file: T) => void;
  children?: ReactNode;
}

export function OutputFilesCollapse<T extends MessageFile>({
  outputFiles, skillFiles = [], packageFile, downloading,
  title = '本轮对话所有文件', getFileKey = (file) => file.fileId ?? file.fileName,
  renderSkill, onPreviewAll, onPreviewSkill, onDownload, children, className, style,
}: OutputFilesCollapseProps<T>) {
  if (outputFiles.length === 0 && skillFiles.length === 0) return null;
  const actions: MessageAction[] = [];
  if (onPreviewAll) actions.push({ key: 'preview', label: '查看所有文件', icon: <EyeOutlined />, onClick: onPreviewAll });
  if (packageFile && onDownload) actions.push({ key: 'download', label: '下载所有文件', icon: <DownloadOutlined />, loading: downloading, onClick: () => onDownload(packageFile) });
  return (
    <div className={`${styles.outputFiles} ${className ?? ''}`} style={style}>
      <div className={styles.outputSkills}>
        {skillFiles.map((file, index) => (
          <Fragment key={getFileKey(file)}>
            {renderSkill ? renderSkill(file, index) : <SkillOutputCard file={file} onPreview={onPreviewSkill} onDownload={onDownload} downloading={downloading} />}
          </Fragment>
        ))}
      </div>
      {outputFiles.length > 0 && (
        <div className={`${styles.fileCard} ${styles.allOutputFiles}`}><span className={styles.fileTitle}>{title}</span><MessageActions actions={actions} /></div>
      )}
      {children}
    </div>
  );
}
