// Plik: /src/components/ScrollStack/ScrollStack.jsx

import React, { useLayoutEffect, useRef, useCallback, useState, useEffect } from 'react';
import { useTransform, useMotionValueEvent } from 'framer-motion';
import './ScrollStack.css';

export const ScrollStackItem = ({ children, itemClassName = '', style }) => (
  <div className={`scroll-stack-card ${itemClassName}`.trim()} style={style}>{children}</div>
);

const ScrollStack = ({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  rotationAmount = 0,
  scrollProgress,
  scatterProgress,
  isMenuOpen
}) => {
  const scrollerRef = useRef(null);
  const cardsRef = useRef([]);
  const lastTransformsRef = useRef(new Map());
  const isUpdatingRef = useRef(false);

  const cardTopsRef = useRef([]);
  const [simulatedScrollHeight, setSimulatedScrollHeight] = useState(0);
  const simulatedScrollHeightRef = useRef(0);
  const latestStackProgress = useRef(0);
  const latestScatterProgress = useRef(0);

  const calculateProgress = useCallback((scrollTop, start, end) => {
    if (start > end) {
      if (scrollTop < end) return 0;
      if (scrollTop > start) return 1;
      return 1 - (scrollTop - end) / (start - end);
    }

    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }, []);

  const parsePercentage = useCallback((value, containerHeight) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(value);
  }, []);

  const getElementOffset = useCallback(
    (i) => cardTopsRef.current[i] || 0,
    []
  );

  const layoutValuesRef = useRef({
    stackPositionPx: 0,
    scaleEndPositionPx: 0
  });

  const updateCardTransforms = useCallback((scrollTop, scatter = latestScatterProgress.current) => {
    if (!cardsRef.current.length || isUpdatingRef.current) return;
    isUpdatingRef.current = true;

    const { stackPositionPx, scaleEndPositionPx } = layoutValuesRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isNarrow = vw < 768;

    // Choreographed 4-way vinyl scatter vectors (Option A: Cards Scatter)
    // Bottom cards peel outward first, top card (Toxic) lifts subtly toward camera then sweeps out
    const scatterVectors = [
      { x: -0.78 * vw, y: -0.42 * vh, rot: isNarrow ? -14 : -22, dScale: -0.22, delay: 0.0 },
      { x: 0.82 * vw, y: -0.34 * vh, rot: isNarrow ? 13 : 19, dScale: -0.20, delay: 0.05 },
      { x: -0.76 * vw, y: 0.46 * vh, rot: isNarrow ? -12 : -17, dScale: -0.24, delay: 0.1 },
      { x: 0.72 * vw, y: 0.30 * vh, rot: isNarrow ? 10 : 14, dScale: 0.14, delay: 0.16 }
    ];

    cardsRef.current.forEach((card, i) => {
      if (!card) return;

      const cardTop = getElementOffset(i);
      const triggerStart = cardTop - scaleEndPositionPx;
      const triggerEnd = cardTop - stackPositionPx - (itemStackDistance * i);

      const overallProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const translateProgress = Math.min(1, overallProgress / 0.5);
      const scaleProgress = Math.max(0, (overallProgress - 0.5) / 0.5);

      const targetScale = baseScale + i * itemScale;
      let scale = 1 - scaleProgress * (1 - targetScale);

      const totalTranslate = -(cardTop - (stackPositionPx + itemStackDistance * i));
      let translateX = 0;
      let translateY = translateProgress * totalTranslate;
      let rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;
      let opacity = 1;
      let blur = 0;

      // Apply choreographed 3D scatter once cards finish stacking
      if (scatter > 0.0001) {
        const cfg = scatterVectors[i % scatterVectors.length];
        const localT = Math.min(1, Math.max(0, (scatter - cfg.delay) / (1 - cfg.delay)));
        // Smooth accelerating peel-away curve
        const smooth = localT * localT * (3 - 2 * localT);
        const accel = Math.pow(localT, 1.55);

        translateX = cfg.x * accel;
        translateY += cfg.y * accel;
        scale = Math.max(0.35, scale + cfg.dScale * smooth);
        rotation += cfg.rot * smooth;
        opacity = localT < 0.32 ? 1 : Math.max(0, 1 - (localT - 0.32) / 0.68);
        if (!isNarrow && localT > 0.25) {
          blur = ((localT - 0.25) / 0.75) * 4;
        }
      }

      const newTransform = {
        translateX: Math.round(translateX * 100) / 100,
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        opacity: Math.round(opacity * 1000) / 1000,
        blur: Math.round(blur * 10) / 10
      };

      const lastTransform = lastTransformsRef.current.get(i);
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateX - newTransform.translateX) > 0.1 ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.1 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.001 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.05 ||
        Math.abs(lastTransform.opacity - newTransform.opacity) > 0.002 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.1;

      if (hasChanged) {
        card.style.transform = `translate3d(${newTransform.translateX}px, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`;
        card.style.opacity = newTransform.opacity;
        card.style.filter = newTransform.blur > 0.1 ? `blur(${newTransform.blur}px)` : '';
        lastTransformsRef.current.set(i, newTransform);
      }
    });

    isUpdatingRef.current = false;
  }, [
    itemScale, itemStackDistance, baseScale,
    rotationAmount,
    calculateProgress, getElementOffset
  ]);

  const stackProgress = useTransform(
    scrollProgress,
    [0.25, 0.56],
    [0, 1]
  );

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const innerContent = scroller.querySelector('.scroll-stack-inner');
    if (!innerContent) return;
    const cards = Array.from(scroller.querySelectorAll('.scroll-stack-card'));
    if (cards.length === 0) return;

    const containerHeight = scroller.clientHeight;
    layoutValuesRef.current = {
      stackPositionPx: parsePercentage(stackPosition, containerHeight),
      scaleEndPositionPx: parsePercentage(scaleEndPosition, containerHeight)
    };

    cardsRef.current = cards;

    const tops = [];
    cards.forEach((card, i) => {
      card.style.willChange = 'transform, opacity, filter';
      card.style.transformOrigin = 'center center';
      card.style.zIndex = i + 1;
      tops.push(card.offsetTop);
    });
    cardTopsRef.current = tops;

    const scrollHeight = innerContent.scrollHeight;
    const clientHeight = scroller.clientHeight;
    const virtualHeight = scrollHeight - clientHeight;
    simulatedScrollHeightRef.current = virtualHeight;
    setSimulatedScrollHeight(virtualHeight);

    const initialVirtualScrollTop = latestStackProgress.current * virtualHeight;
    updateCardTransforms(initialVirtualScrollTop, latestScatterProgress.current);

    const transformsMap = lastTransformsRef.current;

    return () => {
      cardsRef.current = [];
      cardTopsRef.current = [];
      transformsMap.clear();
      isUpdatingRef.current = false;
    };
  }, [
    stackPosition, scaleEndPosition, parsePercentage,
    itemDistance, updateCardTransforms, children
  ]);

  useMotionValueEvent(stackProgress, "change", (latest) => {
    latestStackProgress.current = latest;
    const virtualScrollTop = latest * simulatedScrollHeightRef.current;
    updateCardTransforms(virtualScrollTop, latestScatterProgress.current);
  });

  useEffect(() => {
    if (!scatterProgress) return;
    latestScatterProgress.current = scatterProgress.get();

    const unsub = scatterProgress.on("change", (latest) => {
      latestScatterProgress.current = latest;
      const virtualScrollTop = latestStackProgress.current * simulatedScrollHeightRef.current;
      updateCardTransforms(virtualScrollTop, latest);
    });

    return () => unsub();
  }, [scatterProgress, updateCardTransforms]);

  useEffect(() => {
    if (isMenuOpen === false) {
      const virtualScrollTop = latestStackProgress.current * simulatedScrollHeight;
      updateCardTransforms(virtualScrollTop, latestScatterProgress.current);
    }
  }, [isMenuOpen, updateCardTransforms, simulatedScrollHeight]);

  return (
    <div className={`scroll-stack-scroller ${className}`.trim()} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
      </div>
    </div>
  );
};

export default ScrollStack;
