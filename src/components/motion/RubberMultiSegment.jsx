// Rubber Segment adaptation for independent selections; multiple charts may
// remain enabled. React Bits attribution: public/licenses/react-bits.md.
import { motion as Motion, useReducedMotion } from 'motion/react';
import './RubberSegment.css';

export default function RubberMultiSegment({ options, selected, onToggle, label }) {
  const reduced = useReducedMotion();
  return <div className="rubber-multi flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
    {options.map(option => {
      const active = selected.has(option);
      return <button key={option} type="button" aria-pressed={active} onClick={() => onToggle(option)}
        className={`relative isolate bg-transparent px-3 py-1 text-xs sm:text-sm rounded-md font-medium cursor-pointer border-none ${active
          ? 'text-brand-600 dark:text-brand-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
        <Motion.span aria-hidden="true" className="rubber-multi__thumb" initial={false}
          animate={{ scaleX: active ? 1 : 0.85, scaleY: active ? 1 : 0.75, opacity: active ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0.2 }} />
        {label ? label(option) : option}
      </button>;
    })}
  </div>;
}
