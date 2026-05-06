# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **`GET /api/events` incremental query params**: `modified_since` (ISO timestamp) returns events whose `updated_at >= value`, enabling O(changed) reconciliation without a date window. `source` (string) filters by the `source` column (e.g. `source=marlin`). `from`/`to` is now optional — at least one of `from+to` or `modified_since` is required. All params compose freely. Required for Marlin↔TTF enrich reconciliation (TTF-ADR-013). (`routes/events.js`)

---

## [0.2.2] - 2026-04-12

### Fixed
- **Recurring pops lost on reload after UTC midnight**: `_initPoppedKeys` used `dateStr(new Date())` (UTC-based) as the staleness pruning threshold. Users in UTC-negative timezones (e.g. PDT, UTC-7) would have today's popped instances incorrectly pruned as stale once UTC rolled past midnight, causing popped recurring balloons to reappear on page reload. Fixed by computing the pruning threshold from local date components (`getFullYear()`, `getMonth()`, `getDate()`) instead of `toISOString()`. See `ttf-adr-012`. (`state.js`)

---

## [0.2.1] - 2026-04-02

### Added
- SVG favicon (`src/frontend/favicon.svg`) — balloon floating over a bullseye target; scales cleanly at all browser tab sizes
- `scripts/seed-adl.js` — one-shot script to populate TTF with recurring Activities of Daily Living (ADLs). Designed for AuDHD executive function: atomic tasks, specific time anchors, medication at High urgency, action-prompt descriptions. Daily events seed from today; weekly events (Laundry/Tidy room/Change sheets) seed to the next correct weekday. Reads port from `config/config.json`. Run once after starting the server: `node scripts/seed-adl.js`

### Fixed
- **Balloon edge clipping**: balloon X positions now constrained to `[edgePad, usable − edgePad]` where `edgePad = 0.5 × radius × zoneScale`. Balloons no longer spawn within half a radius of the zone border.
- **Balloon spacing is now 2D-aware**: the spacing sweep previously enforced a fixed horizontal minimum (1 diameter) between all adjacent balloons regardless of vertical distance. Replaced with `minXDist(dy) = sqrt(max(0, diameter² − dy²))` — when two balloons are ≥ 1 diameter apart vertically they can freely share horizontal space. Eliminates sideways crowding when many events span the full day.
- **Balloon tags always render on top**: tags were drawn inline with their balloon body, so a later balloon body could paint over an earlier tag. Split `drawBalloon` into `drawBalloonBody` (phases 1–3) and `drawBalloonTag` (phase 4), ensuring every tag paints above every body.
- **Dynamic tag background width**: tag pill background was a fixed width regardless of label length, clipping longer titles. Background now sized to `ctx.measureText(label).width + 12px padding`.
- **Tag overlap resolution**: tags on vertically close balloons could collide. A pre-draw pass sorts tags top-to-bottom and slides any tag whose bounding box overlaps a prior tag down the string by the overlap amount + 2px gap. Click detection uses the resolved positions.

---

## [0.2.0] - 2026-03-31

### Added (T1 — Recurrence)
- RFC 5545 seed + RRULE model: recurring events stored as a single seed row with an RRULE string; instances expanded at read time in the frontend via rrule.js (no materialized rows)
- `rrule` and `recurrence_id` columns on `events` table (idempotent migrations)
- Backend validation: RRULE string must begin with a valid `FREQ=` value (DAILY/WEEKLY/MONTHLY/YEARLY), ≤500 chars; `recurrence_id` must be a valid UUID
- GET `/api/events` returns seeds whose DTSTART ≤ `to` alongside regular events; frontend clips instances to the view window
- DELETE `/api/events/:id?mode=all` — removes seed and all exception instances
- DELETE `/api/events/:id?mode=previous&before=YYYY-MM-DD` — advances seed DTSTART to `before` date, removes exception instances before that date
- Recurrence form UI: "Repeats" select (Daily/Weekly/Monthly), BYDAY checkboxes for weekly, Ends options (Never/On date/After N times)
- Series delete dialog: "Remove all occurrences" / "Remove previous occurrences" / Cancel
- `instanceKey` on every event object: `seedId_YYYY-MM-DD` for recurring instances, `id` for one-off events — used to scope pop animations and session-local suppression
- `poppedInstanceKeys` session-local Set: recurring pops suppress only the specific instance for the current session (no DB write); reappears fresh on next page load
- `window.reloadEvents()` exposed from `animation.js` — reloads using the current `loadedCenterDay` so post-mutation reloads fetch the correct window regardless of scroll position
- `src/frontend/js/vendor/rrule.min.js` — UMD bundle (rrule@2.8.1); registers as `window.rrule` (RRule class at `rrule.RRule`)
- View window expanded from ±2 to ±3 days around center
- Test suite extended to 83 tests: recurrence validation (11 new), recurrence integration (10 new), `test/recurrence-expansion.test.js` (10 new — pure expansion logic)

### Fixed (T1 — Recurrence)
- Pop animation keyed on `instanceKey` instead of `event.id` — prevents all recurring instances animating simultaneously when one is popped
- All post-mutation `loadEvents()` calls replaced with `window.reloadEvents()` — blank screen no longer occurs when user has scrolled away from today before editing/deleting

### Security (PR #23)
- Input validation on all API endpoints (`POST`, `PUT /api/events`) — title required and ≤200 chars, date/time formats enforced, urgency must be 0–3 integer, category ≤100 chars, description ≤2000 chars
- PUT field allowlist (`ALLOWED_FIELDS`) prevents mass-assignment; `id` and `created_at` are never mutable by a client
- Validation errors now collected into `{ errors: [] }` array so all problems are surfaced in one response (PR #24)
- Security headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'`
- XSS fix: `innerHTML` replaced with `replaceChildren`/`textContent` in `ui.js` (OWASP A03)
- iCal/CalDAV sync URL validation: non-HTTPS URLs are now rejected at fetch time
- CSP tightened: removed `'unsafe-inline'` from `default-src` (was functionally equivalent to no script policy)

### Changed (PR #23)
- `main.js` reduced from 1026 lines to 8 lines — all logic extracted to purpose-scoped modules:
  - `canvas/context.js` — canvas and ctx globals
  - `canvas/profiles.js` — sound and visual profile definitions
  - `canvas/layout.js` — zone constants and `dayCenterX`
  - `canvas/audio.js` — Web Audio API playback
  - `canvas/renderer.js` — all `draw*` functions and hit detection
  - `canvas/animation.js` — easing, scroll state, `navigate`, `warpToDay`, animation loop
  - `canvas/input.js` — resize handler and all event listeners
  - `utils/date-utils.js` — `dateStr`, `offsetDate`, `dateToDayOffset`
  - `utils/seeded-random.js` — deterministic RNG for stable balloon positions
  - `state.js` — `appConfig`, `loadConfig`, event data, `loadEvents`, `rebuildEventIndex`, `eventsForDay`, `placementCache`
- `loadEvents` failure now renders as a persistent canvas status banner (state-driven, not a one-shot paint)
- `fetchJson` helper extracted in `ui.js` — replaces repeated `fetch().then(r => r.json())` patterns

### Performance (PR #23)
- `eventsByDay` index (rebuilt on `loadEvents`) makes `eventsForDay()` O(1) per call instead of O(n) per frame
- Balloon placement cache eliminates the two-pass spacing sweep on every frame; cache is keyed on `dayOffset + isCenter` and invalidated on `loadEvents`, `navigate`, `warpToDay`, and `resize`
- Animation pauses automatically when the browser tab is backgrounded (Page Visibility API) and resumes on return

### Added (PR #23, #24)
- `src/shared/date-utils.js` — date utilities shared between backend and frontend
- Test suite: 52 tests across 5 files using [vitest](https://vitest.dev/)
  - `test/ical-parser.test.js` — iCal parsing edge cases (9 tests)
  - `test/date-utils.test.js` — date utility functions (11 tests)
  - `test/sync-engine.test.js` — sync engine logic (5 tests)
  - `test/events-validation.test.js` — `validateEvent` unit tests (14 tests)
  - `test/events-integration.test.js` — HTTP layer via supertest: routing, status codes, error shapes, immutability, sync field writability (13 tests)
- `DB_PATH` env var in `database.js`: set to `':memory:'` in tests for a clean, isolated SQLite database per run
- `require.main === module` guard in `server.js` + `module.exports = app` — server can be imported in tests without binding a port

### Fixed (PR #23, #24)
- `setup.js` now writes `soundEnabled` and `categories` to `config.json` on first run
- Duplicate `drawPoppedBalloon` function definition removed from `main.js`
- `server.js` config loading is now try/catch + spread-merge over defaults: a malformed `config.json` logs a warning and the server starts with defaults rather than crashing
- Sync fields (`external_id`, `source`, `source_updated_at`) added to PUT `ALLOWED_FIELDS` so the sync route can update them without being silently dropped

### Known Gaps (deferred)
- **Delete future occurrences**: third series-delete mode — sets `UNTIL` on the RRULE so the series ends at a chosen date; past instances are preserved (routine history intact), future instances stop generating. Use case: routine changed, old data still meaningful.
- Per-instance recurrence exceptions (edit/delete one instance only) — deferred to post-T2
- Balloon physics on scroll (balloons react to belt movement — lag, swing, bounce)
- Scrolling within a day zone for crowded days
- In-tool settings panel (currently requires editing config.json + restart)
- iCal import/export
- Bidirectional Google Calendar sync via OAuth 2.0 (currently read-only via secret iCal URL)
- Avatar: customizable character who physically throws the dart; animations, skins, accessories

---

## [0.1.0] - Initial release

### Added
- Canvas-based renderer with conveyor belt timeline and balloon metaphor
- Three-zone layout: yesterday (left preview) | today (center) | tomorrow (right preview)
- Intro animation: today's zone scrolls in from the right on first click
- Intro sounds: belt rumble, click sequence, arrival clank (Web Audio API, no dependencies)
- SQLite event storage via better-sqlite3; iCalendar-aligned schema
- REST API: `GET/POST/PUT/DELETE /api/events`
- `/api/config` endpoint serving display name, sound toggle, and category definitions
- Create/edit/delete event UI panel with: title, date, start/end times, category, urgency, zettelkasten link, description
- Info panel: click balloon body or tag to view event details, with Edit and Delete actions
- Balloon body is a valid click target (not just the tag)
- Time-based float height: string length maps to time of day (6AM floor, dynamic ceiling = max(7PM, latest event end))
- All-day events park at belt level
- Position-based balloon scale: full size in center zone, 0.72× in preview zones
- Category-based balloon body color (iCal CATEGORIES compatible — stored as display name strings)
  - Self-Care (#4fc3f7), Community (#ab47bc), Productivity (#ffb300), Infrastructure (#4db6ac), Personal (#81c784)
- Urgency-based pulsation speed (Low = still, Normal = slow, High = moderate, Critical = rapid)
- Seeded-random stable balloon X positions within each day zone
- Two-pass sweep enforcing minimum balloon spacing (no overlap, edges may touch)
- Tags anchored directly below balloon body, bobbing in sync
- User-configurable categories and sound toggle via `config/config.json`
- `npm run setup` first-run wizard writes `soundEnabled` and `categories` to config
- `config/config.example.json` template
- Browser tab title reads from `config.displayName`
- Multi-day events expand into one balloon per day; sibling balloons linked by cross-strings
- Scrollable timeline: unlimited navigation left (past) and right (future)
- Warp-to-date panel: jump to any date instantly
- Help overlay panel
- Pop/restore: mark events complete; popped balloons are static (no bob, no pulse)
- Dart-pin pop animation v2: dart flies in horizontally (200ms), pins balloon at its apex; balloon collapses downward — deflated skin hangs from pin point (450ms); once stationary only the flights-side shaft is visible (tip implied embedded in wall); time metaphor preserved, remnant stays where the event was
- Avatar placeholder: stick figure in top-right corner (future: customizable dart-throwing character)
- Calendar sync: Google Calendar via secret iCal URL (read-only); NextCloud CalDAV (bidirectional)
- `npm run seed:test` / `seed:test:reset` — deterministic test data covering all visual features and warp targets
