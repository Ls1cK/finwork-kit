import { useState, useEffect, useRef, useMemo } from 'react';
import { calculateNextFrame, StreamOptions } from './smoothStreamEngine';
import { useMemoizedFn } from 'ahooks';

export function useSmoothStream(
  targetContent: string,
  isStreaming: boolean,
  options: Partial<StreamOptions> = {},
) {
  // Fix #3: useMemo 缓存 config，避免每次渲染重建对象
  const optionsKey = JSON.stringify(options);
  const config: StreamOptions = useMemo(
    () => ({
      syncThreshold: 100,
      minStep: 1,
      maxStep: 10,
      sensitivity: 8,
      overlayLen: 10,
      transitionReserve: 20,
      brakeRatio: 4,
      ...options,
    }),
    // optionsKey 是 options 的稳定字符串指纹；options 本身为每次渲染新建的内联对象，无法直接作 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optionsKey],
  );

  const [displayedContent, setDisplayedContent] = useState('');

  // Fix #1: 用 ref 存储显示内容，避免闭包读到过期 state
  const displayedContentRef = useRef('');
  const prevTargetLenRef = useRef(0);
  const currentStepRef = useRef(config.minStep);

  const processNextFrame = useMemoizedFn(() => {
    // 1. 从 ref 读取最新值，避免闭包陷阱
    const currentState = {
      targetContent,
      currentContent: displayedContentRef.current,
      prevTargetLen: prevTargetLenRef.current,
      currentStep: currentStepRef.current,
    };

    // 2. 调用纯函数引擎计算下一帧
    const { nextContent, nextPrevTargetLen, nextStep } = calculateNextFrame(currentState, config);

    // 3. 如果内容有变化，同步更新 ref 和 state
    if (nextContent !== displayedContentRef.current) {
      displayedContentRef.current = nextContent;
      setDisplayedContent(nextContent);
    }

    // 4. 更新 Mutable 引用状态
    prevTargetLenRef.current = nextPrevTargetLen;
    currentStepRef.current = nextStep;
  });

  // Fix #2: 仅在 isStreaming 时启动动画循环，停止后不再空转
  useEffect(() => {
    if (!isStreaming) return;

    let rafId: number;
    const animate = () => {
      processNextFrame();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isStreaming, processNextFrame]);

  // streaming 结束后确保最终内容同步
  if (!isStreaming) {
    // eslint-disable-next-line react-hooks/refs
    displayedContentRef.current = targetContent;
  }

  return isStreaming ? displayedContent : targetContent;
}
