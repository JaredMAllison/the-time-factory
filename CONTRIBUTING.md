# Contributing to The Time Factory

Thanks for your interest. This is a small, intentionally simple project — please read this before opening a PR.

## Philosophy

- **No frameworks.** Vanilla JS, no build step, no bundler. Keep it that way.
- **No over-engineering.** Three similar lines of code is better than a premature abstraction.
- **ADHD-first design.** Every visual decision has a reason. Ask before changing the encoding (color, motion, position).
- **iCal alignment.** Data should stay portable. See `CLAUDE.md` for the design decisions.

## Dev Setup

```bash
git clone https://github.com/UBR-JMA/the-time-factory.git
cd the-time-factory
nvm use          # uses .nvmrc (Node 18)
npm install
cp config/config.example.json config/config.json
npm start
```

Open `http://localhost:3000`. Edit frontend files and refresh — no build step needed.

## Git Workflow

- **Never commit directly to `main`.**
- Create a branch for your work. Prefer a git worktree for isolation:
  ```bash
  git worktree add -b feature/my-thing ../the-time-factory-my-thing
  cd ../the-time-factory-my-thing
  npm install
  ```
- Open a PR against `main`. PRs are merged via **squash merge only**.

## Testing

```bash
npm test          # run all 83 tests (vitest)
npm run test:watch  # watch mode for active development
```

Tests live in `test/`. Two kinds:
- **Unit tests** (`events-validation`, `date-utils`, `ical-parser`, `sync-engine`, `recurrence-expansion`) — call functions directly, no server needed.
- **Integration tests** (`events-integration`) — spin up the real Express app against an in-memory SQLite database via `process.env.DB_PATH = ':memory:'`. Tests the full HTTP layer: routing, status codes, response shapes, and DB round-trips.

New PRs should keep all 83 tests passing. Integration tests in particular are the safety net for the events API.

## Known Issues / Deferred Work

See `CHANGELOG.md` for the current gap list. If you want to tackle one of these, open an issue first to align on approach.

## Known Quirks

- The `data/` directory and `config/config.json` are gitignored — they're per-user and should never be committed.
- Each git worktree has its own `data/` folder with an independent database.
- `const`/`let` at the top level of a classic `<script>` tag are script-scoped, not window-scoped. `canvas/context.js` uses `var` intentionally so `canvas` and `ctx` are available to all other canvas modules without an import system.

## Questions?

Open an issue. Keep it simple.
