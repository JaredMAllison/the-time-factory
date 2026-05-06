# TTF 1.0 — Godot 4 Frontend Design

**Date:** 2026-04-10
**Status:** Approved
**Author:** Jared + Claude (brainstorming session)

---

## Context

TTF v0.2.x uses a vanilla JS canvas renderer. It works but has accumulated visual bugs (balloon overlap, unreliable popping) and is hitting the ceiling of what a canvas renderer can do cleanly. The Godot 4 rebuild replaces the frontend entirely while retaining the Express/SQLite backend unchanged.

This is also a deliberate learning vehicle: TTF 1.0 is Jared's entry point into Godot 4 and GDScript, with AInbound as the downstream project. Architecture decisions favor teachability alongside correctness.

ADR: `ttf-adr-011` — Godot 4 replaces vanilla JS canvas frontend.

---

## Goals

- Full feature parity with TTF v0.2.x
- Exobrain stays online throughout the build — no cutover until parity is reached
- GDScript fundamentals learned through real product work (instancing, signals, physics, HTTPRequest)
- Balloon physics replace manual overlap correction
- Swappable balloon asset slot unlocked as a future capability

---

## Non-Goals

- New features beyond what v0.2.x has (except: future date scrolling, delete-future recurrence mode)
- Rewriting or replacing the Express/SQLite backend
- Bidirectional Google Calendar sync (already deferred in v0.2.x)
- GUT (Godot Unit Testing) — deferred post-cutover, high priority when the time comes

---

## Visual Design

**Theme:** Industrial (theme) Park. Clowns At Work. (No actual clowns.)

Dark industrial base — steel, grit, factory floor aesthetic carried forward from v0.2.x. Warm carnival accent layer on top: balloon colors saturated and vivid, belt has fairground energy, lighting evokes bulb strings over a work site. The balloon metaphor earns its place in the aesthetic.

**Visual vocabulary (preserved from v0.2.x):**

| Element | Meaning |
|---|---|
| Balloon | One event/task |
| Belt | The timeline (horizontal, scrolls) |
| String length | Time of day (short = early, long = late, all-day = at belt) |
| Balloon color | Category |
| Pulse speed | Urgency (still = low, rapid = critical) |
| Tag | Label below balloon — tap to open detail |
| Left zone | Past days (preview scale, dimmed) |
| Center zone | Today (full scale, full alpha) |
| Right zone | Future days (preview scale, dimmed) |

Specific palette and asset decisions are deferred to Phase 3 (first visual milestone).

---

## Environment & Prerequisites

- **Godot version:** 4.4 (current stable)
- **Backend:** Node.js + Express, unchanged from v0.2.x
- **Launch:** Single shell script (`launch.sh`) starts the backend and opens Godot — replaces the AHK launcher used for v0.2.x
- **Window behavior:** Fullscreen/maximized by default. AHK handles show/hide toggling for quick reference and dismissal throughout the day.
- **Rollback:** `src/frontend/` is never deleted until after cutover. If Godot is mid-build, kill Godot, open browser — JS frontend still works.

---

## Configuration

Godot reads `config/config.json` — the same file the backend already uses. No second config to maintain.

Relevant config keys Godot consumes:
- Backend URL and port (e.g., `http://localhost:3000`)
- Category definitions (name → color mapping for balloon colors)

If the backend URL is not reachable at launch, Godot shows a clear error: **"Can't reach the backend. Is the server running?"** with a retry button. A quiet retry loop runs underneath — the error clears automatically when the connection is restored.

---

## Architecture

### Project Structure

```
the-time-factory/
├── src/
│   ├── backend/           ← unchanged
│   ├── frontend/          ← retained until cutover, then retired
│   └── shared/
├── godot/                 ← Godot 4 project root
│   ├── project.godot
│   ├── scenes/
│   ├── scripts/
│   └── assets/
├── docs/
│   └── superpowers/specs/ ← this file
├── launch.sh              ← starts backend + opens Godot
└── config/config.json     ← shared config
```

### API Layer

The existing `GET /api/events` endpoint is **unchanged** — the JS frontend continues to work throughout development.

Two new backend additions (Phase 0):

**`GET /api/events/expanded?from=YYYY-MM-DD&to=YYYY-MM-DD`**
Returns fully expanded event instances for the date range. Recurrence seeds are expanded server-side — Godot receives flat instances only, no rrule library needed in Godot.

**`DELETE /api/events/:id?mode=future&from=YYYY-MM-DD`**
Truncates a recurring series at a given date: adds `UNTIL=date` to the seed's RRULE, deletes exception instances after that date. Keeps all past occurrences intact.

All other endpoints (POST, PUT, DELETE mode=all, DELETE mode=previous) are unchanged.

### Godot Scenes

Component scene architecture. Each visual unit is its own `.tscn` file, instantiated into the scene tree at runtime.

```
Main.tscn
├── Belt.tscn              ← timeline, scroll, zones, spawns balloons
│   └── BalloonEvent.tscn  ← one instance per event (spawned at runtime)
├── HUD.tscn               ← date display, prev/next navigation
├── EventForm.tscn         ← create + edit panel
└── EventDetail.tscn       ← info panel + delete (all recurrence modes)

Autoloads (singletons):
├── ApiClient.gd           ← all HTTP requests; emits signals on response
└── AppState.gd            ← shared app state (visible date range, selected event, scroll position)
```

### BalloonEvent Scene Structure

```
BalloonEvent (RigidBody2D)
├── Sprite2D               ← swappable visual slot (texture swapped at runtime)
├── CollisionShape2D       ← circle; drives lateral balloon-to-balloon push
├── Line2D                 ← the string; updates each frame as balloon drifts
├── Label                  ← tag below balloon
└── AnimationPlayer        ← urgency pulse animation
```

### Balloon Physics

Y axis is deterministic: string length computed from `start_time`, maps to canvas height. Physics does not touch Y.

X axis is physics-driven: each balloon has a home X position (seeded from event ID, matching v0.2.x behavior). A spring force pulls it back to home. `CollisionShape2D` pushes overlapping balloons apart laterally. Result: balloons bunch and separate naturally, strings sway, no manual overlap correction needed.

This replaces the two-pass minimum-spacing sweep from the JS version.

### Signal Flow

```
BalloonEvent  →  emits: balloon_tapped(event_data), balloon_popped(event_id)
Belt          →  listens to balloons; calls ApiClient; triggers AppState refresh
ApiClient     →  emits: events_loaded(data), event_saved(event), event_deleted(id)
AppState      →  emits: state_changed(); scenes listen and re-render
EventForm     →  emits: form_submitted(data), form_cancelled
Main          →  wires signals between scenes
```

Nothing talks directly to its grandparent. Data flows up via signals, down via method calls.

### State Management

`AppState.gd` (autoload) owns:
- Visible date range (`from`, `to`)
- Currently selected event
- Scroll position
- Connection status

`ApiClient.gd` (autoload) owns:
- HTTPRequest management
- Response parsing
- Error signaling

---

## Testing Strategy

**Backend:** All new endpoints (expanded, mode=future delete) get Vitest integration tests in the same commit as the implementation. The existing test suite is extended, not replaced.

**Godot:** Manual integration testing for Phases 1–9. GUT deferred post-cutover — high priority when added. `AppState.gd` is the first target when GUT is introduced (logic worth asserting on).

**Definition of done per phase:** See Build Sequence below.

---

## Build Sequence

Cutover to Godot as primary frontend happens after Phase 9. `src/frontend/` is retired at that point.

| Phase | What gets built | Done when... |
|---|---|---|
| 0 | Backend: `/api/events/expanded` + `mode=future` delete + tests + ADR | Tests pass; JS frontend still works |
| 1 | Godot 4.4 installed; project scaffold; ApiClient autoload; fetch events → print to console | Events appear in Godot output log |
| 2 | Belt scene + zones + open-ended scroll (no day limit) | Belt renders; scroll moves between days |
| 3 | BalloonEvent spawning — string length, color from category, label | Balloons appear on belt at correct heights |
| 4 | RigidBody2D physics — spring toward home X + collision push | Balloons push each other; strings sway |
| 5 | Tap → EventDetail panel (info + single delete) | Can read event details; can delete one-off events |
| 6 | Balloon pop → marks complete_at via API + audio | Core daily use loop works |
| 7 | HUD — date display + multi-day navigation | Can jump forward/back across days |
| 8 | EventForm — create + edit | Full read/write |
| 9 | Recurrence delete UI — this only / all / future from date | Full recurrence parity |
| 10 | Urgency pulse animation | Urgency visible |
| 11 | Swappable asset slot — import custom balloon sprites | Pipe dream unlocked |

Post-cutover (no fixed order):
- GUT + AppState tests
- Shader-based balloon glow (optional, evaluate during Phase 10)
- In-app config editor (currently requires editing config.json + restart)
- iCal import/export

---

## Open Questions / Deferred Decisions

- **Shader vs AnimationPlayer for urgency pulse:** AnimationPlayer assumed for Phase 10. Shaders evaluated if AnimationPlayer can't achieve the desired visual.
- **GDExtensions:** None planned. Revisit if a specific capability gap emerges.
- **Nextcloud/iCal sync:** Backend already has sync engine. Godot UI for sync controls deferred post-cutover.
- **Avatar (dart thrower):** Placeholder exists in v0.2.x. Carry the concept forward; implementation deferred.

---

## Rollback

`src/frontend/` is never touched until after Phase 9 cutover. At any point during the build:
1. Kill Godot
2. Open browser to `http://localhost:3000`
3. JS frontend is fully functional

The only risk is if Phase 0 backend changes break the existing endpoint — which they won't, because Phase 0 adds new endpoints only.
