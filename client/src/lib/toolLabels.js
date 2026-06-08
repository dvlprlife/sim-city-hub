// Maps Claude Code tool names to human labels for the activity line. Pure (no
// React/DOM) so both the live chat (useConversations) and the run-transcript
// replay (runTranscript) can share it without dragging React into a node:test.
export const TOOL_LABELS = {
  Read: 'Reading', Write: 'Writing', Edit: 'Editing', MultiEdit: 'Editing',
  Bash: 'Running command', Grep: 'Searching', Glob: 'Finding files',
  WebFetch: 'Fetching', WebSearch: 'Searching the web', Task: 'Delegating',
  TodoWrite: 'Planning',
};
