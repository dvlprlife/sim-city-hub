// Parse the CLI's --output-format stream-json (newline-delimited JSON) into the
// hub's WebSocket event union. Line-buffered so partial chunks are safe.
//
// With --include-partial-messages we receive BOTH incremental deltas (for live
// typing) AND the complete assistant message. We emit deltas as
// { partial: true } for the live cursor, and the completed blocks as final
// events. The frontend shows partials transiently, then commits on the final
// event (and only finals are persisted to agent_run_events).

// Guard against a child that emits a huge (or never-terminated) line: cap the
// line buffer so a malformed stream-json line can't grow it without bound (OOM).
const MAX_LINE_BYTES = 8 * 1024 * 1024;

export function createStreamParser({ onEvent }) {
  let buffer = '';

  function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // non-JSON noise (rare); ignore
    }

    switch (msg.type) {
      case 'system':
        if (msg.session_id) onEvent({ type: 'agent:session', sessionId: msg.session_id });
        if (msg.model) onEvent({ type: 'agent:model', model: msg.model, source: 'verified' });
        break;

      case 'assistant':
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            onEvent({ type: 'agent:output', text: block.text });
          } else if (block.type === 'thinking' && block.thinking) {
            onEvent({ type: 'agent:thinking', text: block.thinking, final: true });
          } else if (block.type === 'tool_use') {
            onEvent({
              type: 'agent:activity',
              activity: { type: 'tool_use', id: block.id, name: block.name, input: block.input },
            });
          }
        }
        if (msg.message?.usage) onEvent({ type: 'usage', usage: msg.message.usage });
        break;

      case 'user':
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_result') {
            onEvent({
              type: 'agent:tool_result',
              toolUseId: block.tool_use_id,
              isError: Boolean(block.is_error),
              summary: summarizeToolResult(block.content),
            });
          }
        }
        break;

      case 'stream_event': {
        const ev = msg.event;
        if (ev?.type === 'content_block_delta') {
          if (ev.delta?.type === 'text_delta') {
            onEvent({ type: 'agent:output', text: ev.delta.text, partial: true });
          } else if (ev.delta?.type === 'thinking_delta') {
            onEvent({ type: 'agent:thinking', text: ev.delta.thinking, partial: true });
          }
        }
        break;
      }

      case 'result':
        if (msg.usage) onEvent({ type: 'usage', usage: msg.usage });
        onEvent({
          type: 'result',
          subtype: msg.subtype,
          sessionId: msg.session_id,
          isError: Boolean(msg.is_error),
        });
        break;

      default:
        break;
    }
  }

  return {
    feed(chunk) {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) handleLine(line);
      }
      // No newline yet but the buffer is oversized — a hostile/runaway line. Drop
      // it rather than accumulate unbounded; the next newline resyncs the stream.
      if (buffer.length > MAX_LINE_BYTES) buffer = '';
    },
    end() {
      const line = buffer.trim();
      if (line) handleLine(line);
      buffer = '';
    },
  };
}

function summarizeToolResult(content) {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join('');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}
