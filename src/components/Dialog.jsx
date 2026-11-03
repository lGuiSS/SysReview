import { forwardRef, useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pilha de diálogos abertos: Esc e Tab só agem no diálogo do topo.
const stack = [];

const focusableIn = (node) => [...node.querySelectorAll(FOCUSABLE)]
  .filter(el => el.offsetParent !== null || el === document.activeElement);

/**
 * Painel de diálogo modal: role="dialog", aria-modal, Esc fecha, Tab fica preso
 * dentro do painel e o foco volta para quem abriu ao fechar.
 * Substitui a <div> do painel; o overlay continua com cada modal.
 */
export const DialogPanel = forwardRef(function DialogPanel(
  { onClose, labelledBy, label, role = 'dialog', closeOnEscape = true, fallbackFocus, focusPanel = false, className = '', children, ...props },
  forwardedRef
) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => { fallbackRef.current = fallbackFocus; }, [fallbackFocus]);

  const setRef = (node) => {
    panelRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement;
    stack.push(panel);

    if (!panel.contains(document.activeElement)) {
      // focusPanel: foca o próprio painel (sem contorno em botão ao usar atalhos de teclado)
      (focusPanel ? panel : panel.querySelector('[autofocus]') || focusableIn(panel)[0] || panel).focus({ preventScroll: true });
    }

    const onKeyDown = (event) => {
      if (stack[stack.length - 1] !== panel) return;
      if (event.key === 'Escape' && closeOnEscape && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableIn(panel);
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = stack.lastIndexOf(panel);
      if (index !== -1) stack.splice(index, 1);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
      else if (fallbackRef.current) queueMicrotask(() => fallbackRef.current()?.focus());
    };
  }, [closeOnEscape]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={setRef}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={-1}
      className={`focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export default DialogPanel;
