import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validateEvent } = require('../src/backend/routes/events');

describe('validateEvent', () => {
  it('returns null for a valid full event (POST mode)', () => {
    const body = {
      title: 'Team standup',
      date: '2026-03-25',
      start_time: '09:00',
      end_time: '09:30',
      description: 'Daily standup meeting',
      category: 'Work',
      urgency: 1,
    };
    expect(validateEvent(body, true)).toBeNull();
  });

  it('returns null for a valid minimal event', () => {
    expect(validateEvent({ title: 'Buy milk', date: '2026-03-25' }, true)).toBeNull();
  });

  it('returns error when title is missing (POST mode)', () => {
    const result = validateEvent({ date: '2026-03-25' }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/title/i);
  });

  it('returns error when title exceeds 200 characters', () => {
    const body = { title: 'a'.repeat(201), date: '2026-03-25' };
    const result = validateEvent(body, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/200/);
  });

  it('returns error when date is missing (POST mode)', () => {
    const result = validateEvent({ title: 'No date' }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/date/i);
  });

  it('returns error for invalid date format', () => {
    const result = validateEvent({ title: 'Bad date', date: 'not-a-date' }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/YYYY-MM-DD/);
  });

  it('returns error for invalid urgency value', () => {
    const result = validateEvent({ title: 'Urgent', date: '2026-03-25', urgency: 99 }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/urgency/i);
  });

  it('accepts all valid urgency values (0, 1, 2, 3)', () => {
    for (const u of [0, 1, 2, 3]) {
      expect(validateEvent({ title: 'Test', date: '2026-03-25', urgency: u }, true)).toBeNull();
    }
  });

  it('returns error when description exceeds 2000 characters', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', description: 'x'.repeat(2001) }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/2000/);
  });

  it('returns error when category exceeds 100 characters', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', category: 'c'.repeat(101) }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/100/);
  });

  it('returns null in PUT mode with no title or date provided', () => {
    expect(validateEvent({ description: 'Updated notes' }, false)).toBeNull();
  });

  it('returns error in PUT mode with invalid urgency', () => {
    const result = validateEvent({ urgency: 99 }, false);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/urgency/i);
  });

  it('accepts null completed_at as valid', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', completed_at: null }, true)).toBeNull();
  });

  it('returns error when completed_at is a number', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', completed_at: 42 }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/completed_at/i);
  });

  // ── rrule validation ────────────────────────────────────────────────────────
  // The backend stores RRULE strings that the frontend uses to expand recurrence
  // seeds. Only the four standard RFC 5545 frequencies are accepted.

  it('returns null for a valid daily rrule', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', rrule: 'FREQ=DAILY' }, true)).toBeNull();
  });

  it('returns null for a valid weekly rrule with BYDAY', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' }, true)).toBeNull();
  });

  it('returns null for a monthly rrule with UNTIL', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', rrule: 'FREQ=MONTHLY;UNTIL=20261231' }, true)).toBeNull();
  });

  it('returns null when rrule is explicitly null (not recurring)', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', rrule: null }, true)).toBeNull();
  });

  it('returns error when rrule has an unrecognised FREQ value', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', rrule: 'FREQ=HOURLY' }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/FREQ=/);
  });

  it('returns error when rrule does not start with FREQ=', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', rrule: 'BYDAY=MO' }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/FREQ=/);
  });

  it('returns error when rrule is not a string', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', rrule: 42 }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/rrule/i);
  });

  it('returns error when rrule exceeds 500 characters', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', rrule: 'FREQ=DAILY;' + 'X'.repeat(495) }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/500/);
  });

  // ── recurrence_id validation ────────────────────────────────────────────────
  // recurrence_id is a FK to the seed event id. Must be a UUID when provided.

  it('returns null for a valid recurrence_id UUID', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', recurrence_id: '12345678-1234-1234-1234-123456789abc' }, true)).toBeNull();
  });

  it('returns null when recurrence_id is null', () => {
    expect(validateEvent({ title: 'Test', date: '2026-03-25', recurrence_id: null }, true)).toBeNull();
  });

  it('returns error when recurrence_id is not a UUID', () => {
    const result = validateEvent({ title: 'Test', date: '2026-03-25', recurrence_id: 'not-a-uuid' }, true);
    expect(result).not.toBeNull();
    expect(result.errors[0]).toMatch(/recurrence_id/i);
  });
});
