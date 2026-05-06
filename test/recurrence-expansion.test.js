// Unit tests for the recurrence expansion algorithm used in state.js.
//
// state.js calls RRule.fromString() and rule.between() to expand a seed event
// into instance dates for the current view window. These tests verify that the
// rrule library behaves as expected for the patterns TTF stores — daily, weekly
// with BYDAY, UNTIL cutoff, and COUNT limit — so we know what to expect when
// the frontend expands them.
//
// This also acts as a regression guard: if the rrule library ever changes its
// API or date expansion semantics, these tests will catch it.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { RRule } = require('rrule');

// Helper: expand an RRULE + DTSTART string to date strings within [from, to].
// Mirrors the logic in state.js loadEvents() exactly.
function expandToDateStrings(dtstart, rrule, from, to) {
  const rule = RRule.fromString(`DTSTART:${dtstart.replace(/-/g,'')}\nRRULE:${rrule}`);
  // Use UTC boundaries to match rrule's UTC-based instance generation
  const windowStart = new Date(from + 'T00:00:00Z');
  const windowEnd   = new Date(to   + 'T23:59:59Z');
  return rule.between(windowStart, windowEnd, true)
    .map(d => d.toISOString().slice(0, 10));
}

describe('Recurrence expansion — FREQ=DAILY', () => {
  it('generates one date per day in the window', () => {
    const dates = expandToDateStrings('2026-04-01', 'FREQ=DAILY', '2026-04-03', '2026-04-07');
    expect(dates).toEqual([
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
    ]);
  });

  it('includes the start date when the window includes the start date', () => {
    const dates = expandToDateStrings('2026-04-01', 'FREQ=DAILY', '2026-04-01', '2026-04-01');
    expect(dates).toEqual(['2026-04-01']);
  });

  it('returns empty array when window is entirely before start date', () => {
    const dates = expandToDateStrings('2026-04-10', 'FREQ=DAILY', '2026-04-01', '2026-04-09');
    expect(dates).toHaveLength(0);
  });
});

describe('Recurrence expansion — FREQ=WEEKLY with BYDAY', () => {
  it('generates only Mondays for BYDAY=MO', () => {
    // 2026-04-06 is a Monday. Window spans two weeks.
    const dates = expandToDateStrings('2026-04-06', 'FREQ=WEEKLY;BYDAY=MO', '2026-04-01', '2026-04-19');
    expect(dates).toEqual(['2026-04-06', '2026-04-13']);
  });

  it('generates Mon and Wed for BYDAY=MO,WE', () => {
    const dates = expandToDateStrings('2026-04-06', 'FREQ=WEEKLY;BYDAY=MO,WE', '2026-04-06', '2026-04-12');
    expect(dates).toEqual(['2026-04-06', '2026-04-08']);
  });

  it('returns empty array when no matching weekday falls in the window', () => {
    // BYDAY=SA: nearest Saturday from 2026-04-06 is 2026-04-11, but window ends 2026-04-10
    const dates = expandToDateStrings('2026-04-06', 'FREQ=WEEKLY;BYDAY=SA', '2026-04-06', '2026-04-10');
    expect(dates).toHaveLength(0);
  });
});

describe('Recurrence expansion — FREQ=MONTHLY', () => {
  it('generates one date per month on the same day-of-month', () => {
    const dates = expandToDateStrings('2026-01-15', 'FREQ=MONTHLY', '2026-01-01', '2026-04-30');
    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  });
});

describe('Recurrence expansion — UNTIL cutoff', () => {
  it('stops generating instances after the UNTIL date', () => {
    // UNTIL=20260408: should include 04-06 and 04-07 but not 04-09 or 04-10
    const dates = expandToDateStrings('2026-04-06', 'FREQ=DAILY;UNTIL=20260408', '2026-04-06', '2026-04-12');
    expect(dates).toEqual(['2026-04-06', '2026-04-07', '2026-04-08']);
  });
});

describe('Recurrence expansion — COUNT limit', () => {
  it('stops after N total instances regardless of window size', () => {
    // COUNT=3: only 3 instances starting from DTSTART
    const dates = expandToDateStrings('2026-04-01', 'FREQ=DAILY;COUNT=3', '2026-04-01', '2026-04-30');
    expect(dates).toHaveLength(3);
    expect(dates[0]).toBe('2026-04-01');
    expect(dates[2]).toBe('2026-04-03');
  });

  it('returns fewer than COUNT when window ends before count is exhausted', () => {
    // COUNT=10 but window only covers 3 days
    const dates = expandToDateStrings('2026-04-01', 'FREQ=DAILY;COUNT=10', '2026-04-01', '2026-04-03');
    expect(dates).toHaveLength(3);
  });
});
