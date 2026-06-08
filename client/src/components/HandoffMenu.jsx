// Parses the literal handoff token an agent emits on its own line:
//   [HANDOFF:other-person-id] <fully self-contained prompt for the next person>
// The receiving Person gets ZERO conversation history — the prompt carries it all.
const HANDOFF_RE = /\[HANDOFF:([a-z0-9-]+)\]\s*([\s\S]*)/i;

export function parseHandoff(text = '') {
  const m = String(text).match(HANDOFF_RE);
  if (!m) return null;
  return { targetPersonId: m[1], prompt: m[2].trim() };
}

export default function HandoffMenu({ text, onHandoff }) {
  const handoff = parseHandoff(text);
  if (!handoff || !handoff.prompt) return null;
  return (
    <div className="handoff">
      <button onClick={() => onHandoff(handoff)}>↪ Hand off to {handoff.targetPersonId}</button>
    </div>
  );
}
