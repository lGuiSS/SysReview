// Adapted from React Bits Rubber Segment, Copyright (c) 2026 David Haz.
// MIT + Commons Clause; see public/licenses/react-bits.md.
// The same stretch/land effect for existing navigation and tab markup, including
// wrapped rows and vertical sections. The native controls keep their semantics.
import { cloneElement, useCallback, useLayoutEffect, useRef } from 'react';
import { animate, motion as Motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import './RubberSegment.css';

export default function RubberSegmentGroup({ value, children, className = '' }) {
  const rootRef = useRef(null);
  const thumbRef = useRef(null);
  const previous = useRef(null);
  const timer = useRef(null);
  const generation = useRef(0);
  const reduced = useReducedMotion();
  const left = useMotionValue(0), right = useMotionValue(0);
  const top = useMotionValue(0), bottom = useMotionValue(0);
  const width = useMotionValue(0), height = useMotionValue(0);
  const clipPath = useTransform(() => `inset(${top.get()}px ${Math.max(0, width.get() - right.get())}px ${Math.max(0, height.get() - bottom.get())}px ${left.get()}px round 8px)`);

  const measure = useCallback((shouldAnimate) => {
    const root = rootRef.current, thumb = thumbRef.current;
    if (!root || !thumb) return;
    const selected = root.querySelector('[aria-current="page"], [role="tab"][aria-selected="true"], [aria-pressed="true"]');
    if (!selected) {
      thumb.style.visibility = 'hidden';
      previous.current = null;
      clearTimeout(timer.current);
      generation.current++;
      [left, right, top, bottom].forEach(edge => edge.stop());
      return;
    }
    const rect = selected.getBoundingClientRect(), bounds = root.getBoundingClientRect();
    const sx = bounds.width / root.offsetWidth || 1, sy = bounds.height / root.offsetHeight || 1;
    const x = (rect.left - bounds.left) / sx + root.scrollLeft - root.clientLeft;
    const y = (rect.top - bounds.top) / sy + root.scrollTop - root.clientTop;
    const target = [x, x + rect.width / sx, y, y + rect.height / sy];
    // O thumb vai só até a borda do item (ou da animação em curso), nunca até o scrollWidth:
    // medir pelo scrollWidth, que arredonda para cima, fazia o próprio thumb criar rolagem
    const setExtent = (w, h) => { width.set(w); height.set(h); };
    const old = previous.current;
    if (old && target.every((edge, i) => Math.abs(edge - old[i]) < 0.25)) {
      if (reduced) {
        clearTimeout(timer.current);
        generation.current++;
        [left, right, top, bottom].forEach((edge, i) => edge.jump(target[i]));
        setExtent(target[1], target[3]);
      } else {
        setExtent(Math.max(target[1], right.get()), Math.max(target[3], bottom.get()));
      }
      return;
    }
    previous.current = target;
    clearTimeout(timer.current);
    const version = ++generation.current;
    const edges = [left, right, top, bottom];
    thumb.style.visibility = 'visible';
    if (!old || !shouldAnimate || reduced) {
      edges.forEach((edge, i) => edge.jump(target[i]));
      setExtent(target[1], target[3]);
      return;
    }
    setExtent(Math.max(target[1], right.get()), Math.max(target[3], bottom.get()));
    // Stretch from the current visible bounds, so interrupted clicks stay smooth.
    const envelope = [Math.min(left.get(), target[0]), Math.max(right.get(), target[1]),
      Math.min(top.get(), target[2]), Math.max(bottom.get(), target[3])];
    edges.forEach((edge, i) => animate(edge, envelope[i], { duration: 0.19, ease: [0.23, 1, 0.32, 1] }));
    timer.current = setTimeout(() => {
      const dx = target[0] - old[0], dy = target[2] - old[2];
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const direction = Math.sign(horizontal ? dx : dy) || 1;
      const trailing = horizontal ? (direction > 0 ? 0 : 1) : (direction > 0 ? 2 : 3);
      edges.forEach((edge, i) => {
        animate(edge, target[i] + (i === trailing ? direction * 3 : 0), { type: 'spring', duration: 0.3, bounce: 0 })
          .then(() => {
            if (i === trailing && generation.current === version) {
              animate(edge, target[i], { type: 'spring', duration: 0.16, bounce: 0 })
                .then(() => { if (generation.current === version) setExtent(target[1], target[3]); });
            }
          });
      });
    }, 150);
  }, [left, right, top, bottom, width, height, reduced]);

  useLayoutEffect(() => { measure(true); }, [measure, value, children]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(root);
    root.querySelectorAll('[data-rubber-item]').forEach(item => observer.observe(item));
    let disposed = false;
    document.fonts?.ready.then(() => { if (!disposed) measure(false); });
    return () => { disposed = true; observer.disconnect(); };
  }, [measure, children.type]);
  useLayoutEffect(() => () => {
    clearTimeout(timer.current);
    generation.current++;
    [left, right, top, bottom].forEach(edge => edge.stop());
  }, [left, right, top, bottom]);

  const setRef = node => {
    rootRef.current = node;
    const ref = children.props.ref;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  const Thumb = children.type === 'ol' ? Motion.li : Motion.span;
  return cloneElement(children, {
    ref: setRef,
    className: `rubber-segment-group ${className} ${children.props.className ?? ''}`,
  }, <>
    <Thumb ref={thumbRef} aria-hidden="true" className="rubber-segment-group__thumb" style={{ width, height, clipPath }} />
    {children.props.children}
  </>);
}
