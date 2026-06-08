import { Component } from 'react';

// Error boundary. With no `fallback` prop it's the app-wide boundary: a render
// error in any component would otherwise unmount the whole React tree to a blank
// page, so it shows a recoverable inline message instead. Pass a `fallback`
// (a node, or a function of the error) to scope it locally and degrade just that
// subtree — e.g. one chat bubble dropping to raw text if its lazy markdown chunk
// fails to load, instead of taking down the whole app. Class component because
// that's the only way to define componentDidCatch / getDerivedStateFromError.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (fallback !== undefined) {
        return typeof fallback === 'function' ? fallback(this.state.error) : fallback;
      }
      return (
        <div className="app-error" role="alert">
          <h2>Something went wrong</h2>
          <p>The interface hit an unexpected error. Reload to recover.</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
