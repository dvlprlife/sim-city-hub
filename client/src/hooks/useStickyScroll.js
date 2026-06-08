import { useEffect, useRef } from 'react';

// Pins a scroll container to the bottom on new content — unless the user has
// scrolled up to read history (then it leaves them be). Attach the returned ref
// to the scrollable element and pass a value that changes on new content.
export function useStickyScroll(dep) {
  const ref = useRef(null);
  const sticky = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => {
      sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && sticky.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  return ref;
}
