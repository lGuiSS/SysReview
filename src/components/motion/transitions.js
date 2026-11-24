// Transitions.dev — Modal open/close, Menu dropdown, Tabs sliding and Dropdown menu morph.
// Adapted to React/Motion; attribution and upstream licenses: public/licenses/.
export const EASE_OUT = [0.22, 1, 0.36, 1];
export const QUICK = 0.15;
export const ENTER = 0.25;

export const panelMotion = (reduced, kind = 'modal') => ({
  initial: { opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.96, y: reduced || kind === 'modal' ? 0 : -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: reduced ? 0 : ENTER, ease: EASE_OUT } },
  exit: { opacity: 0, scale: reduced ? 1 : 0.96, y: reduced || kind === 'modal' ? 0 : -4,
    transition: { duration: reduced ? 0 : QUICK, ease: EASE_OUT } },
});
