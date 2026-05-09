# The Time Factory

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow.svg)](package.json)

An ADHD-friendly visual calendar tool. Events are balloons floating above a conveyor belt timeline — the further up, the later in the day. Color tells you what kind of task it is. Pulse speed tells you how urgent it is.

## Concept

- **Balloons** = events/tasks, tethered to the belt by strings
- **String length** = time of day (6AM = near the belt, later = higher)
- **Balloon color** = task category (Self-Care, Community, Productivity, Infrastructure, Personal)
- **Pulse speed** = urgency (Low = still, Critical = rapid)
- **Three zones**: yesterday (left) | today (center, full size) | tomorrow (right)
- **All-day events** park at belt level

## Requirements

- [Node.js](https://nodejs.org/) v18 or later

## Setup

```bash
git clone https://github.com/JaredMAllison/the-time-factory.git
cd the-time-factory
npm install
cp config/config.example.json config/config.json
npm start
```

Open `http://localhost:3000` in your browser.

## Configuration

Edit `config/config.json` to customize:

```json
{
  "port": 3000,
  "displayName": "My Time Factory",
  "soundEnabled": true,
  "categories": [
    { "name": "Self-Care",      "color": "#4fc3f7" },
    { "name": "Community",      "color": "#ab47bc" },
    { "name": "Productivity",   "color": "#ffb300" },
    { "name": "Infrastructure", "color": "#4db6ac" },
    { "name": "Personal",       "color": "#81c784" }
  ]
}
```

Restart the server after changes.

## Usage

- **Click anywhere** to start the intro animation and audio
- **＋ button** (bottom right) to create a new event
- **Click a balloon tag** to view event details, edit, or delete
- **Escape** closes any open panel

## Seed Scripts

To populate with a default set of Activities of Daily Living (ADLs) — daily hygiene, meals, medication, and weekly chores — designed for AuDHD executive function support:

```bash
npm run seed:adl           # run once after starting the server
```

To populate with sample events that exercise every visual feature (urgency levels, all categories, float heights, crowded days, multi-day events, popped balloons, and warp targets):

```bash
npm run seed:test          # add test events (safe to run on existing data)
npm run seed:test:reset    # wipe all events first, then seed
```

## Data

Events are stored locally in `data/events.db` (SQLite). No account or internet connection required.

## Testing

```bash
npm test
```

83 tests across unit and HTTP integration suites. See `CONTRIBUTING.md` for details.

## Architecture

- **Frontend**: Vanilla JS canvas rendering, no framework, no build step. Logic is split across `canvas/` (drawing, animation, audio, input), `utils/` (date math, seeded RNG), and `state.js` (data loading, event index). `main.js` is an 8-line boot sequence.
- **Backend**: Node.js + Express. Input validation on all write endpoints. PUT uses an explicit field allowlist to prevent mass-assignment.
- **Database**: SQLite via better-sqlite3. iCalendar-aligned schema (CATEGORIES as free-form text, PRIORITY maps to urgency 0–3).
- **Deployment**: Per-user local installation — each user runs their own server. No accounts, no cloud.

## Known Deferred Work

- **Per-instance recurrence exceptions** — edit or delete a single occurrence without affecting the whole series
- **Delete future occurrences** — third series-delete mode: set `UNTIL` on the RRULE so the series ends at a chosen date
- **Scrolling within a day zone** — for days with many events
- **Balloon physics on scroll** — balloons lag, swing, and bounce as the belt moves
- **Avatar** — customizable character in the top-right corner who physically throws the dart; animations, skins, accessories
- **In-tool settings panel** — currently requires editing `config.json` and restarting
- **iCal import/export**
- **Bidirectional Google Calendar sync** — full read/write via OAuth 2.0; currently read-only via secret iCal URL
