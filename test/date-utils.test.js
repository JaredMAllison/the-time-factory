import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { dateStr, offsetDate, dateToDayOffset } = require('../src/shared/date-utils');

describe('dateToDayOffset', () => {
  // Use local-time Date constructors (year, month-1, day) so that
  // today.getFullYear/getMonth/getDate return the expected local values
  // regardless of the test runner's timezone offset.

  it('returns 0 for the same day', () => {
    const today = new Date(2026, 2, 25); // March 25, 2026 local midnight
    expect(dateToDayOffset('2026-03-25', today)).toBe(0);
  });

  it('returns -1 for yesterday', () => {
    const today = new Date(2026, 2, 25);
    expect(dateToDayOffset('2026-03-24', today)).toBe(-1);
  });

  it('returns 1 for tomorrow', () => {
    const today = new Date(2026, 2, 25);
    expect(dateToDayOffset('2026-03-26', today)).toBe(1);
  });

  it('returns 7 for seven days ahead', () => {
    const today = new Date(2026, 2, 25);
    expect(dateToDayOffset('2026-04-01', today)).toBe(7);
  });

  it('handles DST spring-forward (US, March 8 2026)', () => {
    // In the US, DST springs forward on March 8 at 2am — that day is only 23 hours.
    // dateToDayOffset uses Math.round() to absorb the 1-hour discrepancy.
    const today = new Date(2026, 2, 7); // March 7, 2026 local midnight
    expect(dateToDayOffset('2026-03-08', today)).toBe(1);
  });

  it('handles leap day (Feb 29, 2028)', () => {
    const today = new Date(2028, 1, 28); // Feb 28, 2028 local midnight
    expect(dateToDayOffset('2028-02-29', today)).toBe(1);
  });
});

describe('offsetDate', () => {
  it('returns the same date when adding 0 days', () => {
    const base = new Date('2026-03-25T00:00:00');
    const result = offsetDate(base, 0);
    expect(dateStr(result)).toBe('2026-03-25');
  });

  it('adds 1 day', () => {
    const base = new Date('2026-03-25T00:00:00');
    expect(dateStr(offsetDate(base, 1))).toBe('2026-03-26');
  });

  it('subtracts 1 day with -1', () => {
    const base = new Date('2026-03-25T00:00:00');
    expect(dateStr(offsetDate(base, -1))).toBe('2026-03-24');
  });

  it('crosses a month boundary', () => {
    const base = new Date('2026-03-31T00:00:00');
    expect(dateStr(offsetDate(base, 1))).toBe('2026-04-01');
  });
});

describe('dateStr', () => {
  it('returns a YYYY-MM-DD string for a known date', () => {
    const d = new Date('2026-03-25T00:00:00Z');
    expect(dateStr(d)).toBe('2026-03-25');
  });
});
