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

  // Agent output is untrusted text. This path deliberately ships WITHOUT
  // rehype-raw, so react-markdown escapes embedded HTML rather than mounting it —
  // no sanitizer is in the loop for prose, and adding rehype-raw would put one
  // there. Pinned so that change can't land unnoticed.
  it('escapes embedded HTML instead of mounting it', () => {
    const out = html('<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>');
    // No live element is created — the payload survives only as escaped text, so
    // asserting on the raw substring would be wrong; assert on real tags.
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<[^>]+\son\w+=/i);   // no tag carries an event handler
    expect(out).toContain('&lt;img');             // shown to the user as text
  });
});
