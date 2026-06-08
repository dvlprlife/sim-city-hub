import { useEffect, useRef, useState } from 'react';

// Lazy-loaded mermaid renderer. The library is large, so we import it on first
// use only — Vite splits it into its own chunk and the main bundle stays lean.
// A valid diagram renders to SVG; anything invalid (including a diagram that is
// still streaming in chunk by chunk) falls back to showing the raw source, so a
// malformed block never crashes the chat.
let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      // 'default' theme (dark ink on light) suits the light assistant bubble.
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let seq = 0;

export default function Mermaid({ code }) {
  const ref = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const id = `mmd-${seq++}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        // On a parse error mermaid throws before removing the temp element it
        // appends to <body> (#d<id>); with a fresh id per render — and the
        // effect re-running on every streamed chunk — these would pile up.
        // Remove it ourselves (no-op on success, where mermaid already cleaned).
        if (typeof document !== 'undefined') document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    // Invalid or still-streaming diagram — show the source instead of breaking.
    return (
      <pre className="mermaid-src">
        <code>{code}</code>
      </pre>
    );
  }
  return <div className="mermaid-diagram" ref={ref} />;
}
