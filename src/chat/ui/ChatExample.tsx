import styles from './styles.module.less';

export interface ChatExampleProps {
  title?: string;
}

export function ChatExample({ title = 'FinWork Chat' }: ChatExampleProps) {
  return (
    <section className={styles.example} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>Chat UI 示例组件，真实对话能力将在后续阶段接入。</p>
    </section>
  );
}
