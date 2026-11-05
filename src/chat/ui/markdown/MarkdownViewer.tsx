import React, { AnchorHTMLAttributes, ImgHTMLAttributes, memo, useMemo, useState } from 'react';
import Markdown, { MarkdownToJSX } from 'markdown-to-jsx';
import { Typography, Divider } from 'antd';

import styles from './markdown.module.less';
import { EXT_TO_LANGUAGE } from './languages';
import { imgFallBack } from './constants';
import { preprocessMarkdown } from './preprocess';
import { extractFrontMatter } from './frontMatter';
import MarkdownCodeBlock from './MarkdownCodeBlock';

const { Title, Link } = Typography;

const unsetComp = () => <span></span>;

/**
 * Markdown 图片接管组件：走原生 img，加载失败时降级为占位图，
 * 兜底处理相对路径等无法加载的图片，避免展示破图。
 */
interface MarkdownImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
}

const MarkdownImage: React.FC<MarkdownImageProps> = ({ src, ...props }) => {
  const [errored, setErrored] = useState(false);

  const handleError = () => setErrored(true);

  return <img src={errored ? imgFallBack : src} {...props} onError={handleError} />;
};

/**
 * 代码块未闭合时 markdown-to-jsx 会把 <template>、<script>、<style> 等当作真实 HTML 解析，
 * 导致 React string ref 报错和 XSS 风险。统一降级为安全的 inline 元素。
 */
const SafeInline: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span>{children}</span>
);

// 继承原生 a 标签的所有属性类型
interface SafeLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  // 虽然 AnchorHTMLAttributes 已经包含了 href 和 children，
  // 但显式声明可以提升 IDE 的智能提示体验
  href?: string;
  children?: React.ReactNode;
}

// 原生<a></a> 和 <Link> 的type不兼容，先去掉
const SafeLink: React.FC<Omit<SafeLinkProps, 'type'>> = ({ href, children, ...props }) => {
  // 添加防御性检查：由于 href 可能是 undefined，所以先判断是否存在
  const isDangerous = href ? href.trim().toLowerCase().startsWith('javascript:') : false;

  // 拦截恶意链接，替换为安全的占位符
  const safeHref = isDangerous ? '#' : href;

  const isAnchor = !!safeHref && safeHref.startsWith('#');

  return (
    <Link
      href={safeHref}
      className={styles.link}
      // 页内锚点链接（href 以 # 开头，如引用来源 `#ref:...`）保持页内定位语义，
      // 不加 target="_blank"，避免点击拼出完整 URL 触发路由跳转/SSO 重定向
      target={isAnchor ? undefined : '_blank'}
      rel={isAnchor ? undefined : 'noopener noreferrer'}
      {...props}
    >
      {children}
    </Link>
  );
};

export interface MarkdownViewerProps {
  content: string;
  /** 接管代码块复制，可接入宿主的剪贴板能力。 */
  onCopy?: (text: string) => void | Promise<void>;
  /** 外部可传入额外 overrides，会与内置 overrides 合并（外部优先） */
  overrides?: MarkdownToJSX.Options['overrides'];
  options?: Omit<MarkdownToJSX.Options, 'overrides' | 'disableParsingRawHTML'>;
  /** 解析后的 YAML front matter 元数据回调，是否展示由外部调用方决定 */
  onMeta?: (meta: Record<string, unknown>) => void;
  /** 是否渲染 Markdown 中的图片，默认展示 */
  showImage?: boolean;
  /**
   * 流式对话专属的额外预处理函数（如引用锚点补全、mcp 保护）。
   * 在基础 preprocessMarkdown 之后叠加；通用渲染（文件预览等）不传。
   */
  extraPreprocess?: (content: string) => string;
  docMarkdown?: boolean;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  onCopy,
  overrides,
  options = {},
  onMeta,
  showImage = true,
  extraPreprocess,
  docMarkdown = false,
}) => {
  const safeContent = useMemo(() => {
    // 流式专属额外逻辑（引用锚点补全、mcp 保护）先行注入，仅 StreamingMarkdownRenderer 传递；
    // 基础预处理对所有调用方一视同仁（md 文件本身也可能是不规范内容）。
    const pre = extraPreprocess ? extraPreprocess(content) : content;
    const processed = preprocessMarkdown(pre);

    // 解析并剥离 YAML front matter，meta 由外部调用方决定如何展示
    const { content: body, meta } = extractFrontMatter(processed);
    if (Object.keys(meta).length > 0) {
      onMeta?.(meta);
    }

    return body;
  }, [content, onMeta, extraPreprocess]);

  const mergedOverrides = useMemo<MarkdownToJSX.Options['overrides']>(
    () => ({
      // --- Antd 组件替换 ---
      h1: { component: Title, props: { level: 3, className: styles.heading } },
      h2: { component: Title, props: { level: 4, className: styles.heading } },
      h3: { component: Title, props: { level: 5, className: styles.heading } },
      hr: { component: Divider },
      a: { component: SafeLink },
      // showImage 为 true（默认）时正常渲染图片，否则降级为空元素以忽略图片
      img: showImage
        ? {
            component: MarkdownImage,
            props: {
              className: styles.image,
              style: { maxWidth: '100%', borderRadius: '4px' },
            },
          }
        : { component: unsetComp },

      // --- 防御：代码块未闭合时这些标签会被当作真实 HTML ---
      script: { component: unsetComp },
      style: { component: unsetComp },
      template: { component: SafeInline },
      iframe: { component: unsetComp },
      object: { component: unsetComp },
      embed: { component: unsetComp },
      form: { component: SafeInline },
      input: { component: unsetComp },
      textarea: { component: unsetComp },
      select: { component: unsetComp },
      button: { component: SafeInline },

      // --- 核心：集成 Highlight.js ---
      code: {
        component: ({ className, children }) => {
          if (className) {
            const language = EXT_TO_LANGUAGE[className.replace('lang-', '')] || 'plaintext';
            // 流式对话输出的AssistantContent，由于属于同一个块，会有多个MarkdownCodeBlock，无法设置collapseKey，来进行持久化，只能走默认的降级逻辑，无法在流式对话结束后重新渲染时，恢复对话时的展开/折叠状态
            return <MarkdownCodeBlock language={language} code={children} onCopy={onCopy} />;
          }
          return <code>{children}</code>;
        },
      },

      // 外部 overrides 优先覆盖
      ...overrides,
    }),
    [overrides, showImage, onCopy],
  );

  return (
    <Markdown
      options={{
        forceBlock: true,
        // markdown-to-jsx@8 单根节点默认不创建 wrapper，导致 wrapperProps/className 丢失。
        forceWrapper: true,
        ...options,
        disableParsingRawHTML: true,
        overrides: mergedOverrides,
      }}
      className={`${styles.md} ${docMarkdown ? styles.doc : ''}`}
    >
      {safeContent}
    </Markdown>
  );
};

export default memo(MarkdownViewer);
