# DrinkGroupBuy Development Notes

## Project Overview

DrinkGroupBuy is a drink group-buying web app. The product should help an organizer create a drink order event, let participants submit orders through a shared link, and give the organizer a clean summary for checkout and shop ordering.

## Current Status

This project is at the architecture/planning stage. No application scaffold has been created yet.

Important notes are stored in:

- `docs/ai_notes.md`: product and architecture discussion.
- `docs/todo.md`: current progress and next tasks.

## Suggested Architecture

- Backend: Node.js + Express.
- Database: SQLite for the first version.
- Frontend: start with plain HTML/CSS/JavaScript or React after the MVP scope is confirmed.
- API style: REST.

## Development Principles

- Keep the first version small and useful.
- Prefer simple, maintainable code over premature abstractions.
- Do not require participant login unless the product direction changes.
- Keep organizer workflows fast: create, share, review, close, export.
- Record important architecture decisions in `docs/ai_notes.md`.
- Track implementation work in `docs/todo.md`.

## Expected First Workflow

```text
Organizer creates group buy
  -> participant opens shared link
  -> participant submits drink order
  -> organizer reviews list and summary
  -> organizer marks payment status
  -> organizer closes group buy
  -> organizer exports final order text
```

## Local Execution

Application setup has not been created yet. Once the stack is chosen, update this section with:

- install command
- development server command
- test command
- database setup command
- environment variables

## Notes For Future Codex Sessions

- Start by reading `AGENTS.md`, `docs/ai_notes.md`, and `docs/todo.md`.
- Check the current git state before editing files.
- Do not overwrite user changes.
- If the project has already been scaffolded, follow the existing stack and patterns.

