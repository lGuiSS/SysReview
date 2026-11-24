// Adapted from React Bits Warm Tooltip, Copyright (c) 2026 David Haz.
// MIT + Commons Clause; see public/licenses/react-bits.md.
// Shared warm window, viewport-aware positioning, keyboard focus and touch-safe triggers.
import { cloneElement, createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion as Motion, useMotionValue, useReducedMotion } from 'motion/react';
import { EASE_OUT } from './transitions.js';

const TooltipContext = createContext(null);

export function WarmTooltipGroup({ children, delay = 400, warmWindow = 300 }) {
  const id = useId();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(null);
  const [position, setPosition] = useState(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const positioned = useRef(false);
  const bubble = useRef(null);
  const current = useRef(null);
  const opened = useRef(false);
  const timer = useRef(null);
  const warmUntil = useRef(0);
  const clear = useCallback(() => clearTimeout(timer.current), []);
  const hide = useCallback((owner, instant = false) => {
    if (owner && current.current?.owner !== owner) return;
    clear();
    const close = () => {
      if (opened.current) warmUntil.current = performance.now() + warmWindow;
      opened.current = false;
      positioned.current = false;
      current.current = null;
      setActive(null);
      setPosition(null);
    };
    if (instant) close(); else timer.current = setTimeout(close, 90);
  }, [clear, warmWindow]);
  const show = useCallback((payload, instant = false) => {
    clear();
    const warm = opened.current || performance.now() < warmUntil.current;
    current.current = payload;
    const open = () => {
      if (payload.element.isConnected) { opened.current = true; setActive({ ...payload, instant }); }
    };
    if (instant || warm) open(); else timer.current = setTimeout(open, delay);
  }, [clear, delay]);

  useLayoutEffect(() => {
    if (!active || !bubble.current) return;
    const measure = () => {
      if (!active.element.isConnected) { hide(null, true); return; }
      const rect = active.element.getBoundingClientRect();
      const width = bubble.current.offsetWidth;
      const height = bubble.current.offsetHeight;
      const below = active.side === 'bottom' ? rect.bottom + height + 8 < innerHeight : rect.top < height + 12;
      const next = {
        x: Math.max(8, Math.min(innerWidth - width - 8, rect.left + (rect.width - width) / 2)),
        y: Math.max(8, Math.min(innerHeight - height - 8, below ? rect.bottom + 8 : rect.top - height - 8)),
      };
      // Place a newly mounted bubble at its anchor before fading it in. Only
      // an already visible tooltip should travel between neighbouring buttons.
      if (!positioned.current) {
        x.jump(next.x);
        y.jump(next.y);
        positioned.current = true;
      }
      setPosition(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bubble.current);
    window.addEventListener('resize', measure);
    // Scrolling dismisses the hint so it cannot cover a different row or a detached trigger.
    const dismiss = () => hide(null, true);
    window.addEventListener('scroll', dismiss, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', dismiss, true); };
  }, [active, hide, x, y]);

  useEffect(() => {
    if (!active) return;
    const dismiss = e => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'keydown') { e.preventDefault(); e.stopImmediatePropagation(); }
      hide(null, true);
    };
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('blur', dismiss);
    return () => { window.removeEventListener('keydown', dismiss, true); window.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('blur', dismiss); };
  }, [active, hide]);
  useEffect(() => clear, [clear]);
  const context = useMemo(() => ({ id, owner: active?.owner, show, hide }), [id, active?.owner, show, hide]);
  return <TooltipContext.Provider value={context}>
    {children}
    {active && createPortal(<Motion.div ref={bubble} id={id} role="tooltip" className="warm-tooltip"
      onPointerEnter={clear} onPointerLeave={() => hide(null)}
      style={{ x, y }}
      initial={false} animate={position ? { x: position.x, y: position.y, opacity: 1 } : { opacity: 0 }}
      transition={{ duration: reduced || active.instant ? 0 : 0.16, ease: EASE_OUT }}>
      {active.content}
    </Motion.div>, document.body)}
  </TooltipContext.Provider>;
}

export function WarmTooltip({ children, content, side = 'top', disabled = false }) {
  const group = useContext(TooltipContext);
  const owner = useId();
  const groupRef = useRef(group);
  groupRef.current = group;
  useEffect(() => () => groupRef.current?.hide(owner, true), [owner]);
  if (!group) return <WarmTooltipGroup><WarmTooltip content={content} side={side} disabled={disabled}>{children}</WarmTooltip></WarmTooltipGroup>;
  if (!content || disabled || children.props.disabled) return children;
  const show = (event, instant) => group.show({ owner, element: event.currentTarget, content, side }, instant);
  const chain = (name, action) => event => { children.props[name]?.(event); if (!event.defaultPrevented) action(event); };
  return cloneElement(children, {
    'aria-describedby': [children.props['aria-describedby'], group.owner === owner ? group.id : null].filter(Boolean).join(' ') || undefined,
    onPointerEnter: chain('onPointerEnter', e => { if (e.pointerType !== 'touch' && !e.buttons) show(e, false); }),
    onPointerLeave: chain('onPointerLeave', () => group.hide(owner)),
    onFocus: chain('onFocus', e => { if (e.currentTarget.matches(':focus-visible')) show(e, true); }),
    onBlur: chain('onBlur', () => group.hide(owner, true)),
    onClick: chain('onClick', () => group.hide(owner, true)),
  });
}

export const TooltipButton = forwardRef(function TooltipButton({ title, children, tooltipSide, ...props }, ref) {
  return <WarmTooltip content={title} side={tooltipSide}>
    <button type="button" {...props} ref={ref} aria-label={props['aria-label'] ?? title}>{children}</button>
  </WarmTooltip>;
});
