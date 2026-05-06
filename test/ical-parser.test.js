import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseVEvents } = require('../src/backend/sync/ical-parser');

function makeEvent(lines) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    ...lines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('parseVEvents', () => {
  it('parses a single-day timed event', () => {
    const ical = makeEvent([
      'UID:timed-1@test',
      'SUMMARY:Team meeting',
      'DTSTART:20260325T140000Z',
      'DTEND:20260325T150000Z',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.date).toBe('2026-03-25');
    expect(ev.start_time).toBe('14:00');
    expect(ev.end_time).toBe('15:00');
    // For timed events, end_date carries the DTEND date (same day here)
    expect(ev.end_date).toBe('2026-03-25');
  });

  it('parses an all-day single-day event', () => {
    const ical = makeEvent([
      'UID:allday-1@test',
      'SUMMARY:All Day Event',
      'DTSTART;VALUE=DATE:20260325',
      'DTEND;VALUE=DATE:20260326',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.date).toBe('2026-03-25');
    expect(ev.start_time).toBeNull();
    expect(ev.end_date).toBeNull();
  });

  it('parses an all-day multi-day event', () => {
    const ical = makeEvent([
      'UID:multiday-1@test',
      'SUMMARY:Conference',
      'DTSTART;VALUE=DATE:20260325',
      'DTEND;VALUE=DATE:20260328',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.date).toBe('2026-03-25');
    expect(ev.start_time).toBeNull();
    expect(ev.end_date).toBe('2026-03-27');
  });

  it('handles line folding in SUMMARY', () => {
    // CRLF + space = continuation line
    const raw = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:fold-1@test',
      'DTSTART:20260325T090000Z',
      'DTEND:20260325T100000Z',
      'SUMMARY:This is a very long summar\r\n y that spans two lines',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [ev] = parseVEvents(raw);
    expect(ev.title).toBe('This is a very long summary that spans two lines');
  });

  it('unescapes special characters in SUMMARY', () => {
    const ical = makeEvent([
      'UID:escape-1@test',
      'DTSTART:20260325T090000Z',
      'DTEND:20260325T100000Z',
      'SUMMARY:Meeting\\, Coffee\\\\Catch-up',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.title).toBe('Meeting, Coffee\\Catch-up');
  });

  it('returns empty external_id for event without UID', () => {
    const ical = makeEvent([
      'DTSTART:20260325T090000Z',
      'DTEND:20260325T100000Z',
      'SUMMARY:No UID Event',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.external_id).toBe('');
  });

  it('filters out events without DTSTART', () => {
    const ical = makeEvent([
      'UID:no-dtstart@test',
      'SUMMARY:No Start Event',
    ]);
    const result = parseVEvents(ical);
    expect(result).toHaveLength(0);
  });

  it('uses only the first category when CATEGORIES has multiple values', () => {
    const ical = makeEvent([
      'UID:cat-1@test',
      'DTSTART:20260325T090000Z',
      'DTEND:20260325T100000Z',
      'SUMMARY:Multi Category',
      'CATEGORIES:Work,Personal',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.category).toBe('Work');
  });

  it('parses DTSTART with TZID parameter', () => {
    const ical = makeEvent([
      'UID:tzid-1@test',
      'DTSTART;TZID=America/New_York:20260325T143000',
      'DTEND;TZID=America/New_York:20260325T153000',
      'SUMMARY:Timezone Event',
    ]);
    const [ev] = parseVEvents(ical);
    expect(ev.date).toBe('2026-03-25');
    expect(ev.start_time).toBe('14:30');
  });
});
