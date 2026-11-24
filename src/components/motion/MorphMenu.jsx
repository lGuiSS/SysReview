// Transitions.dev — Dropdown menu morph, adapted to the SysReview file menu.
import { Children, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { AnimatePresence, LayoutGroup, motion as Motion, useIsPresent, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { EASE_OUT, ENTER, QUICK } from './transitions.js';

function MenuPanel({ children, onClose, id, label, icon: Icon, triggerRef }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  useEffect(() => {
    panelRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, []);
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); triggerRef.current?.focus(); return; }
    if (event.key === 'Tab') {
      triggerRef.current?.focus({ preventScroll: true });
      if (event.shiftKey) event.preventDefault();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...panelRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const current = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
      (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  return <Motion.div id={id} ref={panelRef} role="menu" aria-label={label}
    aria-hidden={!present || undefined} inert={!present} onKeyDown={onKeyDown}
    className="morph-menu__panel" initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? 0 : QUICK }}>
    <Motion.span layoutId="file-menu-surface" className="morph-menu__surface morph-menu__surface--open" aria-hidden="true"
      transition={{ duration: reduced ? 0 : ENTER, ease: EASE_OUT }} />
    {/* Título do painel aberto: ocupa a linha toda à esquerda; o nome acessível continua no botão */}
    <div className="morph-menu__head" aria-hidden="true" onClick={() => { onClose(); triggerRef.current?.focus({ preventScroll: true }); }}>
      {Icon && <Icon className="h-5 w-5 shrink-0" />}<span className="truncate">{label}</span>
    </div>
    <div className="morph-menu__items">{Children.map(children, child => {
      if (!isValidElement(child) || child.type !== 'button') return child;
      return cloneElement(child, { role: 'menuitem', tabIndex: -1, onClick: e => {
        onClose();
        triggerRef.current?.focus({ preventScroll: true });
        child.props.onClick?.(e);
      } });
    })}</div>
  </Motion.div>;
}

export function MorphMenu({ open, onOpenChange, label, icon, children }) {
  const Icon = icon;
  const id = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!rootRef.current?.contains(e.target)) onOpenChange(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, onOpenChange]);
  return <LayoutGroup id={id}>
    <div ref={rootRef} data-tour="file-menu" className="morph-menu col-span-6 min-[520px]:col-auto w-full min-[520px]:w-auto">
      <button ref={triggerRef} type="button" className="morph-menu__trigger" aria-expanded={open} aria-controls={id} aria-haspopup="menu"
        onClick={() => onOpenChange(!open)} onKeyDown={e => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); onOpenChange(true); }
          if (e.key === 'Escape' && open) { e.preventDefault(); onOpenChange(false); }
        }}>
        {!open && <Motion.span layoutId="file-menu-surface" className="morph-menu__surface" aria-hidden="true"
          transition={{ duration: reduced ? 0 : ENTER, ease: EASE_OUT }} />}
        {/* Aberto, o rótulo some (o título passa para o painel) e só a seta fica, à direita */}
        <span className={`relative flex items-center gap-1.5 ${open ? 'justify-end' : 'justify-center'}`}>
          <span className={`flex items-center gap-1.5 transition-opacity ${open ? 'opacity-0' : ''}`}><Icon className="h-5 w-5" aria-hidden="true" />{label}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      <AnimatePresence>{open && <MenuPanel id={id} label={label} icon={icon} triggerRef={triggerRef} onClose={() => onOpenChange(false)}>{children}</MenuPanel>}</AnimatePresence>
    </div>
  </LayoutGroup>;
}
