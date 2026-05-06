# The Time Factory — Claude Context

## What This Is

An ADHD-friendly visual calendar tool. A per-user local web app — no accounts, no cloud, no framework. Events are balloons floating above a conveyor belt. The visual encoding is intentional and load-bearing: don't change it without understanding why it exists.

## Visual Vocabulary

| Element | Meaning |
|---------|---------|
| Balloon | One event/task |
| Belt | The timeline (horizontal, scrolls left/right) |
| String length | Time of day (short = early, long = late, all-day = at belt) |
| Balloon color | Category (what kind of task) |
| Pulse speed | Urgency (still = low, rapid = critical) |
| Tag | Label below the balloon — click to open event details |
| Left zone | Yesterday (preview scale, dimmed) |
| Center zone | Today (full scale, full alpha) |
| Right zone | Tomorrow (preview scale, dimmed) |

## Key Files

```
server.js                              Express server; /api/config, /api/events, /api/sync
setup.js                               First-run wizard that writes config/config.json
config/config.example.json             Template — copy to config/config.json to customize
src/
  frontend/
    index.html                         Single-page shell; <script> tags load modules in order
    js/
      main.js                          Boot sequence only (8 lines): loadConfig → loadEvents → draw
      state.js                         appConfig, loadConfig, event data, loadEvents, eventsByDay index, placementCache
      ui.js                            Create/edit/delete/info panels, fetchJson helper
      canvas/
        context.js                     canvas and ctx globals (var — window-scoped for cross-file access)
        profiles.js                    soundProfile and visualProfile definitions
        layout.js                      Zone constants and dayCenterX
        audio.js                       Web Audio API playback functions
        renderer.js                    All draw* functions, hit detection
        animation.js                   easeInOut, scroll state, navigate, warpToDay, animation loop
        input.js                       resize handler and all DOM event listeners
      utils/
        date-utils.js                  dateStr, offsetDate, dateToDayOffset
        seeded-random.js               Deterministic RNG for stable balloon X positions
      vendor/
        rrule.min.js                   UMD bundle (rrule@2.8.1); registers as window.rrule (RRule at rrule.RRule)
    css/main.css                       Industrial dark theme, panel styles
  backend/
    db/database.js                     SQLite schema + migrations; reads DB_PATH env var
    routes/events.js                   CRUD API; validateEvent; ALLOWED_FIELDS whitelist
    sync/google.js                     iCal/CalDAV sync (HTTPS-only)
  shared/
    date-utils.js                      Date utilities shared by backend and frontend
test/
  events-integration.test.js          HTTP integration tests (supertest + vitest)
  events-validation.test.js           validateEvent unit tests
  date-utils.test.js                  Date utility unit tests
  ical-parser.test.js                 iCal parsing tests
  recurrence-expansion.test.js        Pure expansion logic for recurring events (rrule.js)
  sync-engine.test.js                 Sync engine logic tests
data/events.db                         SQLite database (gitignored, per-user)
config/config.json                     User config (gitignored, per-user)
```

## Design Decisions — Do Not Reverse Without Discussion

- **Vanilla JS, no framework.** No React, Vue, build step, or bundler. The canvas renderer is intentional — this is a visual tool, not a form app.
- **iCal alignment.** Categories are stored as display-name strings (iCal CATEGORIES is free-form text). Urgency maps to iCal PRIORITY. This keeps the data portable.
- **Category = balloon body color. Urgency = pulsation speed.** Two independent visual channels. Colors are in `config.json` (user-configurable), not hardcoded in JS.
- **seededRandom(event.id) for X positions.** Balloons land in a stable random position based on their ID — same spot every frame and every page load. Don't replace with per-frame randomness.
- **Two-pass sweep for minimum spacing.** Ensures balloons don't overlap (min center-to-center = 1 diameter) while preserving the random character. See `drawAllBalloons()` in main.js.
- **Float height = time of day.** `computeFloatHeight()` maps start_time to canvas height. The day range is dynamic: 6AM floor, ceiling = max(7PM, latest event end time).
- **Position-based scale, not day-based.** Balloon scale is determined by where the balloon is on screen (center zone vs preview zone), not which day it belongs to. This makes scrolling feel natural.
- **Config-driven categories.** `/api/config` serves category definitions from `config.json`. The `<select>` in the form is populated from this — not hardcoded in HTML.

## Git Workflow

- All changes in a branch — never commit directly to `main`
- Prefer git worktrees for branch isolation
- All merges to `main` via PR, squash merge only
- Worktrees live as siblings: `~/the-time-factory-*`

## Known Deferred Work

See CHANGELOG.md and CONTRIBUTING.md for the full backlog. Key deferred items:
- **Per-instance recurrence exceptions**: edit or delete a single occurrence without affecting the whole series (deferred post-T2)
- Scrolling within a day zone (for crowded days)
- **Avatar**: stick figure placeholder exists in `drawAvatar()` (`canvas/renderer.js`, top-right corner). Future: customizable character who physically throws the dart — animations, skins, accessories.
- In-tool settings panel (currently requires editing config.json + restart)
- iCal import/export
- **Bidirectional Google Calendar sync**: full read/write via Google Calendar API v3 + OAuth 2.0. Requires user to create a Google Cloud project (one-time). Currently read-only via secret iCal URL. The sync panel has a placeholder "Under Construction" block for this.
