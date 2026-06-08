import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownRenderer from './MarkdownRenderer.jsx';

// SSR-render to a string — no jsdom needed. Covers the lazily-loaded markdown
// path's actual output (react-markdown + remark-gfm + the mermaid-fence intercept).
const html = (text) => renderToStaticMarkup(<MarkdownRenderer text={text} />);

describe('MarkdownRenderer', () => {
  it('renders bold/emphasis and headings', () => {
    expect(html('**bold**')).toContain('<strong>bold</strong>');
    expect(html('# Title')).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  it('renders GFM tables (remark-gfm)', () => {
    const out = html('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(out).toContain('<table>');
    expect(out).toContain('<td>1</td>');
  });

  it('renders a fenced code block', () => {
    expect(html('```\ncode\n```')).toContain('<code');
  });

  it('handles empty / nullish text without throwing', () => {
    expect(() => html('')).not.toThrow();
    expect(() => html(undefined)).not.toThrow();
  });
});
