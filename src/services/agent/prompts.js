// Assemble the full system prompt for a spawn:
//   persona prompt.md  +  city guidelines  +  building guidelines  +  context  +  footer
//
// Only two template tokens are substituted: {{PORT}} and <hub-root>. (We use the
// explicit {{PORT}} token rather than a bare "PORT" so we don't clobber words
// like IMPORTANT in persona prose.)
import path from 'node:path';
import { readFileCached } from './fileCache.js';
import { isValidSlug } from '../projects.js';
import { PEOPLE_DIR, GUIDELINES_DIR, HUB_ROOT } from '../../paths.js';

// Guidelines names map to <data>/guidelines/<name>.md, so — like every other id
// that reaches the filesystem (see isValidSlug in projects.js) — they must be
// plain slugs. Without this guard a `guidelines` value like "../../README"
// (settable via the config API, which spreads unvalidated fields) would escape
// GUIDELINES_DIR and read an arbitrary .md file straight into the system prompt.
function readGuidelines(name) {
  if (!isValidSlug(name)) return '';
  return readFileCached(path.join(GUIDELINES_DIR, `${name}.md`));
}

const FOOTER = `# Working inside the Simulated Agent City Hub

A few hub-specific rules override your defaults:

- **Todo list — use the hub API, not TodoWrite.** The built-in TodoWrite tool only
  renders in the CLI console, which the user can't see. Report progress by POSTing to
  \`http://localhost:{{PORT}}/api/tasks/todos/batch\` (create) and PATCHing
  \`http://localhost:{{PORT}}/api/tasks/todos/:id\` with a \`status\` of
  pending | in_progress | done | skipped.
- **Handoffs.** To hand work to another citizen, emit on its own line:
  \`[HANDOFF:other-person-id]\` followed by a fully self-contained prompt. The receiver
  gets NONE of this conversation's history, so include every relevant detail (paths,
  issue numbers, decisions).
- **Diagrams.** You may use \`\`\`mermaid code fences — the hub renders them.
- **Never commit.** Do not run \`git commit\` or \`git push\` unless the user explicitly
  asks. Make the changes and let the user review the diff.
- **Language.** Respond in the user's language.`;

function contextBlock({ city, building, cwd }) {
  const lines = ['# Current context'];
  if (city) lines.push(`- City: ${city.name}`);
  if (building) lines.push(`- Building: ${building.name}`);
  lines.push(`- Working directory (cwd): ${cwd}`);
  return lines.join('\n');
}

export function buildSystemPrompt({ personId, city, building, cwd, port }) {
  const parts = [];

  const persona = readFileCached(path.join(PEOPLE_DIR, personId, 'prompt.md'));
  if (persona) parts.push(persona.trim());

  if (city?.guidelines) {
    const g = readGuidelines(city.guidelines);
    if (g) parts.push(`# City guidelines: ${city.name}\n\n${g.trim()}`);
  }

  if (building?.guidelines) {
    const g = readGuidelines(building.guidelines);
    if (g) parts.push(`# Building guidelines: ${building.name}\n\n${g.trim()}`);
  }

  parts.push(contextBlock({ city, building, cwd }));
  parts.push(FOOTER);

  return parts
    .join('\n\n---\n\n')
    .replaceAll('{{PORT}}', String(port))
    .replaceAll('<hub-root>', HUB_ROOT);
}
