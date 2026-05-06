#!/usr/bin/env node
/**
 * seed-adl.js — seed Activities of Daily Living into The Time Factory
 *
 * Usage:
 *   node scripts/seed-adl.js
 *
 * Edit the ADLs array below to add, remove, or adjust times before running.
 * TTF must be running. Run once — running again creates duplicates.
 */

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

let port = 3000;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.json'), 'utf8'));
  port = cfg.port || 3000;
} catch { /* server will catch missing config */ }

const BASE = `http://localhost:${port}`;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Returns the date string for the next occurrence of a weekday (0=Sun … 6=Sat).
// If today is already that weekday, returns next week's occurrence.
function nextWeekday(targetDay) {
  const d = new Date();
  const delta = ((targetDay - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ─── ADL definitions ──────────────────────────────────────────────────────────
// Edit this list freely before running.
// urgency: 0 = Low (still), 1 = Normal (slow), 2 = High (moderate), 3 = Critical (rapid)
// Omit start_time / end_time for all-day events (parks at belt level).

const TODAY = todayStr();
const NEXT_SAT = nextWeekday(6);
const NEXT_SUN = nextWeekday(0);

const ADLs = [
  // ── Daily: morning ──────────────────────────────────────────────────────────
  {
    title:      'Take morning medication',
    date:       TODAY,
    start_time: '08:00',
    end_time:   '08:15',
    category:   'Self-Care',
    urgency:    2,
    rrule:      'FREQ=DAILY',
    description: 'Check pill organizer — take morning dose',
  },
  {
    title:      'Eat breakfast',
    date:       TODAY,
    start_time: '08:30',
    end_time:   '09:00',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=DAILY',
    description: 'Something, anything — body needs fuel',
  },
  {
    title:      'Brush teeth',
    date:       TODAY,
    start_time: '09:00',
    end_time:   '09:10',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=DAILY',
  },
  {
    title:      'Shower',
    date:       TODAY,
    start_time: '09:10',
    end_time:   '09:40',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=DAILY',
  },

  // ── Daily: afternoon ────────────────────────────────────────────────────────
  {
    title:      'Eat lunch',
    date:       TODAY,
    start_time: '13:00',
    end_time:   '13:30',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=DAILY',
    description: 'Check hunger — eat even if not hungry',
  },
  {
    // All-day: floats at belt as a persistent background reminder
    title:    'Drink water (8 cups / 64 oz)',
    date:     TODAY,
    category: 'Self-Care',
    urgency:  0,
    rrule:    'FREQ=DAILY',
  },

  // ── Daily: evening ──────────────────────────────────────────────────────────
  {
    title:      'Eat dinner',
    date:       TODAY,
    start_time: '18:00',
    end_time:   '18:30',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=DAILY',
  },
  {
    title:      'Brush teeth',
    date:       TODAY,
    start_time: '21:00',
    end_time:   '21:10',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=DAILY',
  },
  {
    title:      'Wind down',
    date:       TODAY,
    start_time: '21:30',
    end_time:   '22:00',
    category:   'Self-Care',
    urgency:    0,
    rrule:      'FREQ=DAILY',
    description: 'Dim lights, no screens, prep for sleep',
  },

  // ── Weekly ──────────────────────────────────────────────────────────────────
  {
    title:      'Laundry',
    date:       NEXT_SAT,
    start_time: '10:00',
    end_time:   '11:00',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=WEEKLY;BYDAY=SA',
  },
  {
    title:      'Tidy room',
    date:       NEXT_SUN,
    start_time: '11:00',
    end_time:   '12:00',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=WEEKLY;BYDAY=SU',
  },
  {
    title:      'Change sheets',
    date:       NEXT_SUN,
    start_time: '12:00',
    end_time:   '12:30',
    category:   'Self-Care',
    urgency:    1,
    rrule:      'FREQ=WEEKLY;BYDAY=SU',
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  // Verify server is up before attempting inserts
  try {
    const ping = await fetch(`${BASE}/api/config`);
    if (!ping.ok) throw new Error(`/api/config returned ${ping.status}`);
  } catch (err) {
    console.error(`\n✗ Cannot reach TTF at ${BASE} — is the server running?\n  (${err.message})\n`);
    process.exit(1);
  }

  console.log(`\nSeeding ${ADLs.length} ADLs into TTF at ${BASE}\n`);

  let ok = 0, fail = 0;

  for (const adl of ADLs) {
    try {
      const res = await fetch(`${BASE}/api/events`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(adl),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg  = body.errors ? body.errors.join(', ') : res.status;
        console.error(`  ✗ ${adl.title} — ${msg}`);
        fail++;
      } else {
        console.log(`  ✓ ${adl.title}`);
        ok++;
      }
    } catch (err) {
      console.error(`  ✗ ${adl.title} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} created, ${fail} failed.\n`);
  if (fail > 0) process.exit(1);
}

main();
