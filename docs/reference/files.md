---
title: 文件展示
description: 文件卡片、文件列表、技能文件与输出文件区域。
---

# 文件展示

组件负责文件展示与操作入口，预览和下载通过回调交给调用方。示例中的操作仅展示回调结果。

<code src="../examples/message-files.tsx"></code>

## API

以下组件均支持 `className?: string`、`style?: CSSProperties`。泛型 `T extends MessageFile` 保留附加字段，回调收到原始文件对象。

### MessageFile

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| fileName | `string` | 是 | 文件名称 |
| fileId | `string` | 否 | 文件标识 |

### MessageFileCard

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| file | `T` | 必填 | 文件对象 |
| title | `ReactNode` | `file.fileName` | 显示名称 |
| icon | `ReactNode` | 文件图标 | 文件图标 |
| actions | `ReactNode` | — | 附加操作 |
| onPreview | `(file: T) => void` | — | 提供后显示预览按钮 |
| onDownload | `(file: T) => void` | — | 提供后显示下载按钮 |
| downloading | `boolean` | — | 下载按钮加载状态 |

### MessageFileList

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| files | `readonly T[]` | 必填 | 文件数组，为空时隐藏 |
| label | `string` | `'上传文件'` | 列表可访问名称 |
| getFileKey | `(file: T) => string` | `fileId ?? fileName` | 唯一 key，同名文件应自行提供 |
| renderFile | `(file: T, index: number) => ReactNode` | — | 替换单文件展示 |
| onPreview | `(file: T) => void` | — | 默认文件卡片的预览回调 |

### SkillOutputCard

继承全部 `MessageFileCard` 属性。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| isSkillDebugTask | `boolean` | — | 为 true 时默认使用文件夹图标；显式 icon 优先 |

### OutputFilesCollapse

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| outputFiles | `readonly T[]` | 必填 | 输出文件，用于决定是否显示汇总卡片 |
| skillFiles | `readonly T[]` | `[]` | 技能文件，逐项显示；与 outputFiles 均为空时隐藏整个区域 |
| packageFile | `T` | — | 下载所有文件时传给回调的打包文件 |
| downloading | `boolean` | — | 下载加载状态 |
| title | `ReactNode` | `'本轮对话所有文件'` | 汇总卡片标题 |
| getFileKey | `(file: T) => string` | `fileId ?? fileName` | 技能文件唯一 key |
| renderSkill | `(file: T, index: number) => ReactNode` | — | 替换技能文件卡片 |
| onPreviewAll | `() => void` | — | 查看所有文件 |
| onPreviewSkill | `(file: T) => void` | — | 预览技能文件 |
| onDownload | `(file: T) => void` | — | 下载技能文件或 packageFile |
| children | `ReactNode` | — | 文件区域后的补充内容 |
