import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import Mermaid from './Mermaid.jsx';

// Recursively flatten a react-markdown child into plain text. rehype-highlight
// may wrap code in <span> nodes, so we can't assume a single string child.
function nodeText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node.props) return nodeText(node.props.children);
  return '';
}

// If a <pre>'s child <code> is a mermaid fence, return its source; else null.
function mermaidSource(child) {
  const cls = child?.props?.className || '';
  if (!/\blanguage-mermaid\b/.test(cls)) return null;
  return nodeText(child.props.children).replace(/\n$/, '');
}

const components = {
  // Intercept ```mermaid fences at the <pre> level (so we replace the whole
  // block rather than nesting a diagram inside <pre>). Other code blocks pass
  // through to the syntax-highlighted default.
  pre({ children, ...props }) {
    const child = Array.isArray(children) ? children[0] : children;
    const src = mermaidSource(child);
    if (src != null) return <Mermaid code={src} />;
    return <pre {...props}>{children}</pre>;
  },
};

// Markdown + GFM (tables, task lists) + syntax-highlighted code fences, with
// ```mermaid fences rendered as live diagrams (see Mermaid.jsx).
export default function MarkdownRenderer({ text }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {text || ''}
      </ReactMarkdown>
    </div>
  );
}
