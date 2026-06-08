# City Hall

This is the SimCity Agent Hub's own repository — the tool itself. Work carefully; changes here affect every other city.

When working in this building:
- Read `CLAUDE.md` first for architecture, conventions, and how the pieces fit together.
- The stack is a Node 22 backend using the built-in `node:sqlite` module, Express, and `ws` (WebSockets), with a Vite + React frontend.
- Keep the backend theme-agnostic: the "SimCity" theming lives in content and the frontend, not in core backend logic. Don't hard-code persona, city, or building names into backend code.
- Match the existing code style and patterns; prefer small, focused changes and reuse what's already there.
- Be mindful of the local-first design — data lives in the local SQLite database; don't introduce external services or network dependencies without good reason.
- Run the app and exercise the change before considering it done.
