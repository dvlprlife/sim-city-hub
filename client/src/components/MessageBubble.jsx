import { Suspense, lazy } from 'react';
import HandoffMenu from './HandoffMenu.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

// Lazy so react-markdown + remark-gfm + rehype-highlight + highlight.js (the
// largest avoidable initial-bundle cost) only load once a markdown bubble
// actually renders. The Suspense fallback shows the raw text meanwhile.
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer.jsx'));

// Renders one chat item. Notes are small inline lines (tool activity, errors);
// user messages are plain; assistant messages are markdown + an optional
// handoff button parsed from the text.
export default function MessageBubble({ message, live, onHandoff }) {
  const { role, text } = message;

  if (role === 'note') return <div className="note">{text}</div>;

  if (role === 'user') {
    return (
      <div className="bubble user">
        <div className="who">You</div>
        <div className="text">{text}</div>
      </div>
    );
  }

  // Raw-text fallback shared by Suspense (chunk loading) and the error boundary
  // (chunk failed to load — e.g. a rotated hash after a redeploy, or offline). A
  // lazy-import rejection throws on render and would otherwise bubble to the
  // app-wide boundary and blank the whole UI; the local boundary degrades just
  // this bubble to plain text instead.
  const raw = <div className="md"><div className="text">{text}</div></div>;
  return (
    <div className={`bubble assistant${live ? ' live' : ''}`}>
      <div className="who">Citizen</div>
      <ErrorBoundary fallback={raw}>
        <Suspense fallback={raw}>
          <MarkdownRenderer text={text} />
        </Suspense>
      </ErrorBoundary>
      {!live && onHandoff && <HandoffMenu text={text} onHandoff={onHandoff} />}
    </div>
  );
}
