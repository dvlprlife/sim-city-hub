// Serialize a conversation's messages (from useConversations) to a markdown
// transcript. Pure — no DOM — so it's unit-testable and the download wrapper
// stays in the component. Assistant text is already markdown (mermaid fences
// included), so it passes through verbatim.
export function conversationToMarkdown(messages, { personName = 'Assistant', includeActivity = false } = {}) {
  const parts = [];
  for (const m of messages || []) {
    if (!m || !m.text) continue;
    if (m.role === 'user') parts.push(`## You\n\n${m.text}`);
    else if (m.role === 'assistant') parts.push(`## ${personName}\n\n${m.text}`);
    else if (m.role === 'note' && includeActivity) parts.push(`_${m.text}_`);
  }
  return parts.join('\n\n');
}
