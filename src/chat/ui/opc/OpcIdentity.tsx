import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  FileSearchOutlined, MinusCircleOutlined, RightOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons';
import { Avatar, Tooltip } from 'antd';
import motionStyles from '../runningShine.module.less';
import styles from './opc.module.less';

export interface OpcAvatarProps {
  role?: 'leader' | 'worker';
  src?: string;
  size?: number;
}

export function OpcAvatar({ role = 'worker', src, size = 32 }: OpcAvatarProps) {
  return (
    <Avatar
      aria-hidden="true"
      className={styles.avatar}
      size={size}
      src={src}
      icon={role === 'leader' ? <TeamOutlined /> : <UserOutlined />}
    />
  );
}

const statusIcons = {
  idle: ClockCircleOutlined,
  started: ClockCircleOutlined,
  running: ClockCircleOutlined,
  success: CheckCircleOutlined,
  completed: CheckCircleOutlined,
  error: CloseCircleOutlined,
  cancelled: MinusCircleOutlined,
  timeout: ExclamationCircleOutlined,
  uncompleted: ExclamationCircleOutlined,
};

export type OpcStatusKind = keyof typeof statusIcons;

export interface OpcStatusProps {
  status?: OpcStatusKind;
  label?: string;
  action?: { member: string; onClick: () => void };
  iconOnly?: boolean;
}

export function OpcStatus({ status, label, action, iconOnly }: OpcStatusProps) {
  const Icon = status ? statusIcons[status] : iconOnly ? FileSearchOutlined : undefined;
  const stateClassName = status === 'running' ? `${styles.state} ${motionStyles.runningShine}` : styles.state;
  if (!action && !Icon && !label) return null;
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      {!iconOnly && <span className={styles.stateLabel}>{label ?? '查看任务详情'}</span>}
    </>
  );
  if (!action) return <span className={stateClassName} data-status={status}>{content}</span>;

  return (
    <Tooltip title="查看任务详情" trigger={['hover', 'focus']} destroyTooltipOnHide>
      <button
        type="button"
        className={[stateClassName, styles.stateAction, iconOnly ? styles.stateActionIconOnly : '']
          .filter(Boolean)
          .join(' ')}
        data-status={status}
        aria-label={`${label ? `${label} · ` : ''}查看任务详情 · ${action.member}`}
        onClick={action.onClick}
      >
        {content}
        {!iconOnly && <RightOutlined className={styles.stateArrow} aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}
