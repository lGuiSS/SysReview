// Adapted from React Bits Spring Check, Copyright (c) 2026 David Haz.
// MIT + Commons Clause; see public/licenses/react-bits.md.
// Native checkbox semantics preserve labels, form behavior and :checked styling.
import { useEffect, useRef } from 'react';
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';

export default function SpringCheck({ checked, onChange, tone = '', className = '', strike = 'none', ...props }) {
  const reduced = useReducedMotion();
  const fillRef = useRef(null);
  const tickRef = useRef(null);
  const value = useMotionValue(checked ? 1 : 0);
  useMotionValueEvent(value, 'change', progress => {
    if (fillRef.current) fillRef.current.style.transform = `scale(${Math.max(0, progress)})`;
    if (tickRef.current) tickRef.current.style.strokeDashoffset = 1 - Math.min(1, Math.max(0, progress));
  });
  useEffect(() => {
    if (reduced) { value.jump(checked ? 1 : 0); return; }
    const animation = animate(value, checked ? 1 : 0, { type: 'spring', visualDuration: 0.2, bounce: 0.1 });
    return () => animation.stop();
  }, [checked, reduced, value]);

  return <span className={`spring-check ${className}`} data-strike={strike}>
    <input {...props} type="checkbox" checked={checked} onChange={onChange}
      className={`spring-check__input ${tone}`} />
    <span ref={fillRef} aria-hidden="true" className="spring-check__fill" style={{ transform: `scale(${value.get()})` }} />
    <svg aria-hidden="true" className="spring-check__tick" viewBox="0 0 24 24">
      <path ref={tickRef} d="m5 12 4 4L19 6" pathLength="1" strokeDasharray="1" style={{ strokeDashoffset: 1 - Math.min(1, Math.max(0, value.get())) }} />
    </svg>
  </span>;
}
