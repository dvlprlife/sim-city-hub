import { useEffect } from 'react';

// Accessibility for modal dialogs: on open, move focus into the dialog; trap Tab
// within it so focus can't escape to the page behind; on close, restore focus to
// whatever was focused before. Pair with the dialog's own Escape handler and
// role="dialog" aria-modal="true". `ref` points at the dialog container (give it
// tabIndex={-1} so it can receive focus as a fallback).
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    const previouslyFocused = document.activeElement;
    const focusables = () => [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);

    (focusables()[0] || node).focus();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [ref, active]);
}
