export interface StreamState {
  targetContent: string;
  currentContent: string;
  prevTargetLen: number;
  currentStep: number;
}
export interface StreamOptions {
  syncThreshold: number;
  minStep: number;
  maxStep: number;
  sensitivity: number;
  overlayLen: number;
  /** 防爆栈跳切后保留多少字符用于减速过渡 */
  transitionReserve: number;
  /** 刹车阻尼：remaining / brakeRatio 决定减速步长 */
  brakeRatio: number;
}
export interface NextFrameResult {
  nextContent: string;
  nextPrevTargetLen: number;
  nextStep: number;
}
export function calculateNextFrame(state: StreamState, options: StreamOptions): NextFrameResult {
  const { targetContent, currentContent, prevTargetLen, currentStep } = state;
  const {
    syncThreshold,
    minStep,
    maxStep,
    sensitivity,
    overlayLen,
    transitionReserve,
    brakeRatio,
  } = options;
  const targetLen = targetContent.length;
  const currentLen = currentContent.length;
  // 1. 处理 Agent 回溯或内容覆盖
  if (
    targetLen < currentLen ||
    (currentLen > 0 &&
      !targetContent.startsWith(currentContent.substring(0, Math.min(currentLen, overlayLen))))
  ) {
    return {
      nextContent: targetContent,
      nextPrevTargetLen: targetLen,
      nextStep: minStep, // 发生重写，速度重置
    };
  }
  // 2. 计算 Delta 并更新水位线与巡航速度
  let nextStep = currentStep;
  let nextPrevTargetLen = prevTargetLen;
  if (targetLen > prevTargetLen) {
    const delta = targetLen - prevTargetLen;
    const calculatedStep = Math.ceil(delta / sensitivity);

    nextStep = Math.max(minStep, Math.min(maxStep, calculatedStep));
    nextPrevTargetLen = targetLen;
  }
  // 3. 如果已经同步完毕，维持现有状态返回
  if (currentLen >= targetLen) {
    return { nextContent: currentContent, nextPrevTargetLen, nextStep };
  }
  // 4. 防爆栈：积压严重时触发瞬间同步（保留尾部 transitionReserve 个字用于过渡动画）
  const remaining = targetLen - currentLen;
  if (remaining > syncThreshold) {
    const jumpTo = Math.max(currentLen, targetLen - transitionReserve);
    return {
      nextContent: targetContent.slice(0, jumpTo),
      nextPrevTargetLen,
      nextStep,
    };
  }
  // 5. 应用步长：结合巡航速度与平滑刹车阻尼
  const appliedStep = Math.min(nextStep, Math.max(minStep, Math.ceil(remaining / brakeRatio)));
  return {
    nextContent: targetContent.slice(0, currentLen + appliedStep),
    nextPrevTargetLen,
    nextStep,
  };
}
