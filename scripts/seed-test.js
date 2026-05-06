#!/usr/bin/env node
/**
 * seed-test.js — deterministic test data for The Time Factory
 *
 * Usage:
 *   node scripts/seed-test.js           # add test events (safe, won't wipe)
 *   node scripts/seed-test.js --reset   # delete all events first, then seed
 *
 * All dates are offsets from today so the data is always current.
 * Each block is labelled with what visual feature it exercises.
 */

// TODO: read port from config/config.json (or accept --port flag) so this
//       works out of the box when setup.js configures a non-default port.
const BASE = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date();
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function offsetDate(days) {
  const d = today();
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

async function post(event) {
  const result = await api('POST', '/api/events', event);
  console.log(`  + [${result.date}] ${result.title}`);
  return result;
}

async function reset() {
  console.log('Resetting: deleting all existing events...');
  const events = await api('GET', `/api/events?from=2000-01-01&to=2099-12-31`);
  for (const e of events) {
    await api('DELETE', `/api/events/${e.id}`);
  }
  console.log(`  Deleted ${events.length} event(s).\n`);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

async function seed() {
  // ── 1. All 4 urgency levels — today, side by side
  //    Tests: pulse speed visual diff (still → rapid)
  console.log('Urgency spectrum (today):');
  await post({ title: 'Urgency 0 — Chill',    date: offsetDate(0), start_time: '09:00', category: 'Personal',      urgency: 0 });
  await post({ title: 'Urgency 1 — Mild',     date: offsetDate(0), start_time: '11:00', category: 'Productivity',  urgency: 1 });
  await post({ title: 'Urgency 2 — Pressing', date: offsetDate(0), start_time: '13:00', category: 'Self-Care',     urgency: 2 });
  await post({ title: 'Urgency 3 — Critical', date: offsetDate(0), start_time: '15:00', category: 'Community',     urgency: 3 });

  // ── 2. All 5 default categories — tomorrow
  //    Tests: balloon body color coverage
  console.log('\nAll categories (tomorrow):');
  await post({ title: 'Self-Care',      date: offsetDate(1), start_time: '08:00', category: 'Self-Care',      urgency: 0 });
  await post({ title: 'Community',      date: offsetDate(1), start_time: '10:00', category: 'Community',      urgency: 0 });
  await post({ title: 'Productivity',   date: offsetDate(1), start_time: '12:00', category: 'Productivity',   urgency: 1 });
  await post({ title: 'Infrastructure', date: offsetDate(1), start_time: '14:00', category: 'Infrastructure', urgency: 0 });
  await post({ title: 'Personal',       date: offsetDate(1), start_time: '16:00', category: 'Personal',       urgency: 0 });

  // ── 3. Float height range — day after tomorrow
  //    Tests: computeFloatHeight() — string length from belt to balloon
  console.log('\nFloat height range (+2 days):');
  await post({ title: 'Early riser (6am)',   date: offsetDate(2), start_time: '06:00', category: 'Self-Care',    urgency: 0 });
  await post({ title: 'Morning (9am)',        date: offsetDate(2), start_time: '09:00', category: 'Productivity', urgency: 0 });
  await post({ title: 'Noon',                 date: offsetDate(2), start_time: '12:00', category: 'Community',    urgency: 1 });
  await post({ title: 'Afternoon (3pm)',      date: offsetDate(2), start_time: '15:00', category: 'Personal',     urgency: 0 });
  await post({ title: 'Late night (11pm)',    date: offsetDate(2), start_time: '23:00', category: 'Infrastructure', urgency: 2, description: 'Should be very close to the belt' });

  // ── 4. All-day events mixed with timed — +3 days
  //    Tests: all-day balloons sitting at belt level vs timed ones floating above
  console.log('\nAll-day vs timed (+3 days):');
  await post({ title: 'All-day (no time)',       date: offsetDate(3), category: 'Community',    urgency: 0, description: 'Should sit at belt' });
  await post({ title: 'Also all-day',            date: offsetDate(3), category: 'Personal',     urgency: 1, description: 'Should sit at belt too' });
  await post({ title: 'Timed among all-days',    date: offsetDate(3), start_time: '10:00', category: 'Productivity', urgency: 2 });

  // ── 5. Crowded day — +4 days
  //    Tests: non-overlapping X placement (two-pass sweep)
  console.log('\nCrowded day — 7 events (+4 days):');
  const crowdTime = ['07:00','09:00','10:30','12:00','13:30','15:00','17:00'];
  const crowdCats = ['Self-Care','Productivity','Community','Personal','Infrastructure','Productivity','Self-Care'];
  for (let i = 0; i < 7; i++) {
    await post({ title: `Crowd ${i + 1}`, date: offsetDate(4), start_time: crowdTime[i], category: crowdCats[i], urgency: i % 4 });
  }

  // ── 6. Multi-day event — spans yesterday through +2 days
  //    Tests: sibling balloon expansion, cross-strings across day zones
  console.log('\nMulti-day event (yesterday → +2):');
  await post({
    title:       'Multi-day: Conference',
    date:        offsetDate(-1),
    end_date:    offsetDate(2),
    start_time:  '09:00',
    end_time:    '17:00',
    category:    'Productivity',
    urgency:     2,
    description: 'Siblings should appear on each day; cross-strings connect them',
  });

  // ── 7. Past events — with completed_at set
  //    Tests: popped (static, no bob/pulse) balloon rendering
  console.log('\nPast / popped events:');
  const pastEvents = [
    { title: 'Popped — 3 days ago', date: offsetDate(-3), start_time: '10:00', category: 'Personal',     urgency: 0 },
    { title: 'Popped — 5 days ago', date: offsetDate(-5), start_time: '14:00', category: 'Self-Care',    urgency: 1 },
    { title: 'Popped — 7 days ago', date: offsetDate(-7), start_time: '11:00', category: 'Productivity', urgency: 2 },
  ];
  for (const e of pastEvents) {
    const created = await post(e);
    // Mark complete via PUT so completed_at is set (use noon on the event's date)
    await api('PUT', `/api/events/${created.id}`, {
      ...created,
      completed_at: `${created.date}T12:00:00.000Z`,
    });
    console.log(`    ↳ marked complete`);
  }

  // ── 8. Far scroll targets — ±7 and ±14 days
  //    Tests: scrollable timeline — unlimited navigation
  console.log('\nFar scroll targets:');
  await post({ title: 'Way back (-7)',   date: offsetDate(-7),  start_time: '10:00', category: 'Personal',     urgency: 0 });
  await post({ title: 'Way ahead (+7)',  date: offsetDate(7),   start_time: '10:00', category: 'Community',    urgency: 1 });
  await post({ title: 'Far future (+14)',date: offsetDate(14),  start_time: '10:00', category: 'Productivity', urgency: 0, description: 'Use warp-to-date to jump here' });

  // ── 9. Warp targets — fixed calendar dates far from today
  //    Tests: warp-to-date with a specific destination (not relative)
  console.log('\nWarp targets (fixed dates):');
  await post({
    title:       'Christmas',
    date:        `${new Date().getFullYear()}-12-25`,
    category:    'Personal',
    urgency:     2,
    description: 'Warp target: Dec 25. Uninflated until the day arrives.',
  });
  // Week of July 30 camping trip (Jul 30 – Aug 5)
  await post({
    title:      'Camping trip',
    date:       `${new Date().getFullYear()}-07-30`,
    end_date:   `${new Date().getFullYear()}-08-05`,
    category:   'Personal',
    urgency:    0,
    description: 'Warp target: Jul 30. Multi-day — cross-strings across the whole week.',
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

(async () => {
  try {
    if (args.includes('--reset')) await reset();
    console.log('Seeding test events...\n');
    await seed();
    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Is the server running on port 3000?');
    process.exit(1);
  }
})();
