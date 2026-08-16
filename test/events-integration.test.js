// Integration tests for the /api/events HTTP layer.
//
// These tests spin up the real Express app against an in-memory SQLite database.
// They complement the unit tests in events-validation.test.js: unit tests prove
// validateEvent() works in isolation; these tests prove the HTTP layer — routing,
// status codes, response shapes, and database round-trips — is wired correctly.
//
// DB_PATH must be set before server.js is required, because database.js reads it
// at module load time (top-level code, not inside a function).

import { beforeAll, describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);

process.env.DB_PATH = ':memory:';
const app = require('../server.js');
const request = supertest(app);

// ---------------------------------------------------------------------------
// GET /api/events — query param validation
// ---------------------------------------------------------------------------

describe('GET /api/events', () => {
  it('returns 400 with errors array when from/to params are missing', async () => {
    const res = await request.get('/api/events');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events — validation and happy path
// ---------------------------------------------------------------------------

describe('POST /api/events', () => {
  it('returns 400 when title is missing', async () => {
    const res = await request.post('/api/events').send({ date: '2026-04-01' });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toMatch(/title/i);
  });

  it('returns 400 when date is invalid', async () => {
    const res = await request.post('/api/events').send({ title: 'Test', date: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toMatch(/YYYY-MM-DD/);
  });

  it('returns 400 when urgency is out of range', async () => {
    const res = await request.post('/api/events').send({ title: 'Test', date: '2026-04-01', urgency: 99 });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toMatch(/urgency/i);
  });

  it('returns 400 when start_time format is wrong', async () => {
    const res = await request.post('/api/events').send({ title: 'Test', date: '2026-04-01', start_time: '9am' });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toMatch(/HH:MM/);
  });

  it('collects multiple validation errors in one response', async () => {
    const res = await request.post('/api/events').send({ date: 'bad', urgency: 99 });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(1);
  });

  it('returns 201 with event object on valid input', async () => {
    const res = await request
      .post('/api/events')
      .send({ title: 'Stand-up', date: '2026-04-01', urgency: 1 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Stand-up');
  });
});

// ---------------------------------------------------------------------------
// POST /api/events — sync provenance fields
//
// external_id / source / source_updated_at are how an event points back at the
// record that owns it elsewhere (for Marlin's /ttf-push, external_id is the
// vault path). POST used to drop all three and still answer 201, so every
// balloon created by push was write-only: the vault knew its ttf_id but TTF had
// no back-reference, and GET /api/events?source=marlin could not see it.
// ---------------------------------------------------------------------------

describe('POST /api/events — sync provenance fields', () => {
  it('round-trips external_id, source and source_updated_at', async () => {
    const payload = {
      title:             'Submit UIB Claim',
      date:              '2026-04-19',
      external_id:       'Tasks/submit-uib-claim.md',
      source:            'marlin',
      source_updated_at: '2026-04-19T12:00:00.000Z',
    };
    const res = await request.post('/api/events').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.external_id).toBe(payload.external_id);
    expect(res.body.source).toBe('marlin');
    expect(res.body.source_updated_at).toBe(payload.source_updated_at);

    // The response echo is not proof of persistence — read it back.
    const read = await request.get(`/api/events/${res.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.external_id).toBe(payload.external_id);
    expect(read.body.source).toBe('marlin');
    expect(read.body.source_updated_at).toBe(payload.source_updated_at);
  });

  it('defaults all three to null when omitted', async () => {
    const res = await request
      .post('/api/events')
      .send({ title: 'Locally authored event', date: '2026-04-20' });
    expect(res.status).toBe(201);
    expect(res.body.external_id).toBeNull();
    expect(res.body.source).toBeNull();
    expect(res.body.source_updated_at).toBeNull();

    const read = await request.get(`/api/events/${res.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.external_id).toBeNull();
    expect(read.body.source).toBeNull();
    expect(read.body.source_updated_at).toBeNull();
  });

  it('makes a POST-created event visible to the source filter query', async () => {
    const res = await request.post('/api/events').send({
      title:       'Reconcilable push',
      date:        '2026-04-21',
      external_id: 'Tasks/reconcilable-push.md',
      source:      'marlin-post-test',
    });
    expect(res.status).toBe(201);

    const list = await request.get(
      '/api/events?source=marlin-post-test&modified_since=1970-01-01T00:00:00.000Z'
    );
    expect(list.status).toBe(200);
    expect(list.body.map(e => e.id)).toContain(res.body.id);
    expect(list.body[0].external_id).toBe('Tasks/reconcilable-push.md');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:id
// ---------------------------------------------------------------------------

describe('PUT /api/events/:id', () => {
  let createdId;

  beforeAll(async () => {
    const res = await request
      .post('/api/events')
      .send({ title: 'Original', date: '2026-04-01' });
    createdId = res.body.id;
  });

  it('returns 400 when urgency is invalid', async () => {
    const res = await request.put(`/api/events/${createdId}`).send({ urgency: 5 });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('does not allow created_at to be overwritten', async () => {
    const res = await request
      .put(`/api/events/${createdId}`)
      .send({ title: 'Updated', created_at: '1970-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.created_at).not.toBe('1970-01-01T00:00:00.000Z');
  });

  it('allows sync fields to be written via PUT', async () => {
    const res = await request
      .put(`/api/events/${createdId}`)
      .send({ external_id: 'cal-abc-123', source: 'google', source_updated_at: '2026-04-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.external_id).toBe('cal-abc-123');
    expect(res.body.source).toBe('google');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request
      .put('/api/events/00000000-0000-0000-0000-000000000000')
      .send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:id', () => {
  it('returns 200 and deleted id on success', async () => {
    const create = await request
      .post('/api/events')
      .send({ title: 'Doomed', date: '2026-04-01' });
    const res = await request.delete(`/api/events/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(create.body.id);
  });

  it('returns 404 when event does not exist', async () => {
    const res = await request.delete('/api/events/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Recurrence — seed creation, GET inclusion, and series DELETE modes
//
// These tests verify the seed + RRULE model at the HTTP boundary:
// - A seed event is created and stored with its RRULE string.
// - GET returns the seed when its DTSTART is within the query range, so the
//   frontend can expand it. It should NOT be returned when the range is
//   entirely before DTSTART.
// - DELETE ?mode=all removes the seed (and any exception instances).
// - DELETE ?mode=previous&before=DATE advances the seed's DTSTART forward,
//   effectively cutting off past occurrences.
// ---------------------------------------------------------------------------

describe('Recurrence — seed creation', () => {
  it('creates a recurring seed with rrule and returns it in the response', async () => {
    const res = await request.post('/api/events').send({
      title: 'Daily standup',
      date:  '2026-04-01',
      rrule: 'FREQ=DAILY',
    });
    expect(res.status).toBe(201);
    expect(res.body.rrule).toBe('FREQ=DAILY');
    expect(res.body.id).toBeTruthy();
  });

  it('returns 400 when rrule has an invalid FREQ', async () => {
    const res = await request.post('/api/events').send({
      title: 'Bad rule',
      date:  '2026-04-01',
      rrule: 'FREQ=HOURLY',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/FREQ=/);
  });

  it('allows rrule to be updated via PUT', async () => {
    const create = await request.post('/api/events').send({
      title: 'Weekly thing',
      date:  '2026-04-07',
      rrule: 'FREQ=WEEKLY',
    });
    const update = await request.put(`/api/events/${create.body.id}`).send({
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    });
    expect(update.status).toBe(200);
    expect(update.body.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');
  });
});

describe('Recurrence — GET includes seeds', () => {
  let seedId;

  beforeAll(async () => {
    const res = await request.post('/api/events').send({
      title: 'Monday review',
      date:  '2026-04-06',  // a Monday
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
    });
    seedId = res.body.id;
  });

  it('returns the seed when the query range includes the start date', async () => {
    const res = await request.get('/api/events?from=2026-04-06&to=2026-04-12');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(seedId);
  });

  it('returns the seed when the query range is after the start date (future instances)', async () => {
    // The seed started on 2026-04-06 but the range is a month later.
    // Backend returns the seed so the frontend can expand future instances.
    const res = await request.get('/api/events?from=2026-05-04&to=2026-05-10');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(seedId);
  });

  it('does not return the seed when the query range is entirely before the start date', async () => {
    const res = await request.get('/api/events?from=2026-03-01&to=2026-04-05');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).not.toContain(seedId);
  });
});

describe('Recurrence — DELETE modes', () => {
  it('DELETE ?mode=all removes the seed and returns deleted id', async () => {
    const create = await request.post('/api/events').send({
      title: 'Doomed series',
      date:  '2026-04-01',
      rrule: 'FREQ=DAILY',
    });
    const del = await request.delete(`/api/events/${create.body.id}?mode=all`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(create.body.id);

    // Confirm it's gone from GET
    const get = await request.get('/api/events?from=2026-04-01&to=2026-04-07');
    const ids = get.body.map(e => e.id);
    expect(ids).not.toContain(create.body.id);
  });

  it('DELETE ?mode=all returns 404 for unknown seed id', async () => {
    const res = await request.delete('/api/events/00000000-0000-0000-0000-000000000000?mode=all');
    expect(res.status).toBe(404);
  });

  it('DELETE ?mode=previous&before= advances seed DTSTART to the given date', async () => {
    const create = await request.post('/api/events').send({
      title: 'Long running series',
      date:  '2026-01-05',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
    });
    const del = await request.delete(
      `/api/events/${create.body.id}?mode=previous&before=2026-04-06`
    );
    expect(del.status).toBe(200);
    expect(del.body.updated).toBe(create.body.id);

    // The seed should no longer appear in a range before the new start date
    const before = await request.get('/api/events?from=2026-01-01&to=2026-04-05');
    const beforeIds = before.body.map(e => e.id);
    expect(beforeIds).not.toContain(create.body.id);

    // But it should still appear for ranges after the new start
    const after = await request.get('/api/events?from=2026-04-06&to=2026-04-12');
    const afterIds = after.body.map(e => e.id);
    expect(afterIds).toContain(create.body.id);
  });

  it('DELETE ?mode=previous returns 400 when before param is missing', async () => {
    const create = await request.post('/api/events').send({
      title: 'Missing before',
      date:  '2026-04-01',
      rrule: 'FREQ=DAILY',
    });
    const res = await request.delete(`/api/events/${create.body.id}?mode=previous`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/before/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events — modified_since and source params (reconciliation filters)
//
// These tests cover the incremental-sync query surface added for Marlin↔TTF
// reconciliation. The modified_since param allows enrich to fetch only events
// changed since the last sync (O(changed) rather than O(date-window)).
// The source param narrows results to events pushed from a specific origin.
// ---------------------------------------------------------------------------

describe('GET /api/events — modified_since param validation', () => {
  it('returns 400 when modified_since is not a valid timestamp', async () => {
    const res = await request.get('/api/events?modified_since=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/modified_since/i);
  });
});

describe('GET /api/events — source filter', () => {
  // These set source via PUT after creation. POST accepts it too (see the
  // "sync provenance fields" block above); the PUT path is kept here because it
  // is the shape the sync engines and the /ttf-push update path both use.
  let marlinId1, marlinId2, googleId;

  beforeAll(async () => {
    const r1 = await request.post('/api/events').send({ title: 'Marlin event A', date: '2026-06-01' });
    marlinId1 = r1.body.id;
    await request.put(`/api/events/${marlinId1}`).send({ source: 'marlin', external_id: 'Tasks/marlin-a.md' });

    const r2 = await request.post('/api/events').send({ title: 'Marlin event B', date: '2026-06-02' });
    marlinId2 = r2.body.id;
    await request.put(`/api/events/${marlinId2}`).send({ source: 'marlin', external_id: 'Tasks/marlin-b.md' });

    const r3 = await request.post('/api/events').send({ title: 'Google event', date: '2026-06-03' });
    googleId = r3.body.id;
    await request.put(`/api/events/${googleId}`).send({ source: 'google', external_id: 'google-cal-123' });
  });

  it('returns only events matching the given source', async () => {
    const res = await request.get('/api/events?source=marlin&modified_since=1970-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(marlinId1);
    expect(ids).toContain(marlinId2);
    expect(ids).not.toContain(googleId);
  });

  it('excludes events with a different source', async () => {
    const res = await request.get('/api/events?source=google&modified_since=1970-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(googleId);
    expect(ids).not.toContain(marlinId1);
    expect(ids).not.toContain(marlinId2);
  });

  it('returns an empty array for an unknown source value (not 404)', async () => {
    const res = await request.get('/api/events?source=unknown-system&modified_since=1970-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/events — modified_since filter', () => {
  let eventId;

  beforeAll(async () => {
    const r = await request.post('/api/events').send({ title: 'Modified since test event', date: '2026-07-01' });
    eventId = r.body.id;
  });

  it('returns events whose updated_at is on or after the given timestamp', async () => {
    const res = await request.get('/api/events?modified_since=1970-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(eventId);
  });

  it('returns an empty array when no events were updated after the timestamp', async () => {
    const res = await request.get('/api/events?modified_since=2099-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('filters on updated_at, not created_at', async () => {
    // Strategy: create event (created_at = T_create), record T_mid, PUT to update
    // (updated_at = T_update > T_mid). Query modified_since=T_mid should return
    // the event via updated_at. If created_at were used it would be excluded,
    // because created_at < T_mid.
    const create = await request.post('/api/events').send({
      title: 'updated_at vs created_at',
      date:  '2026-07-15',
    });
    const tMid = new Date().toISOString();
    await request.put(`/api/events/${create.body.id}`).send({ title: 'updated_at vs created_at — edited' });

    const res = await request.get(`/api/events?modified_since=${encodeURIComponent(tMid)}`);
    expect(res.status).toBe(200);
    const match = res.body.find(e => e.id === create.body.id);
    expect(match).toBeTruthy();
    // Confirm created_at predates the cutoff, proving updated_at drove the match
    expect(new Date(match.created_at) < new Date(tMid)).toBe(true);
  });
});

describe('GET /api/events — combined filter correctness', () => {
  // Seed: 1 marlin event, 1 google event, 1 marlin event on a specific date.
  // Verifies that source + modified_since and source + from/to work together correctly.
  let marlinId, googleId, dateSpecificMarlinId;

  beforeAll(async () => {
    const r1 = await request.post('/api/events').send({ title: 'Combined: marlin general', date: '2026-08-01' });
    marlinId = r1.body.id;
    await request.put(`/api/events/${marlinId}`).send({ source: 'marlin' });

    const r2 = await request.post('/api/events').send({ title: 'Combined: google general', date: '2026-08-02' });
    googleId = r2.body.id;
    await request.put(`/api/events/${googleId}`).send({ source: 'google' });

    const r3 = await request.post('/api/events').send({ title: 'Combined: marlin date-specific', date: '2026-09-01' });
    dateSpecificMarlinId = r3.body.id;
    await request.put(`/api/events/${dateSpecificMarlinId}`).send({ source: 'marlin' });
  });

  it('source + modified_since returns only events matching both criteria', async () => {
    const res = await request.get('/api/events?source=marlin&modified_since=1970-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(marlinId);
    expect(ids).toContain(dateSpecificMarlinId);
    expect(ids).not.toContain(googleId);
  });

  it('from+to+modified_since applies date range AND recency together', async () => {
    // Date range limits to 2026-08-01 only; modified_since=epoch matches everything.
    // Only marlinId (date 2026-08-01) should appear — google is 08-02, dateSpecific is 09-01.
    const res = await request.get(
      '/api/events?from=2026-08-01&to=2026-08-01&modified_since=1970-01-01T00:00:00.000Z'
    );
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(marlinId);
    expect(ids).not.toContain(googleId);
    expect(ids).not.toContain(dateSpecificMarlinId);
  });

  it('from+to without modified_since still works (existing behaviour preserved)', async () => {
    const res = await request.get('/api/events?from=2026-08-01&to=2026-08-02');
    expect(res.status).toBe(200);
    const ids = res.body.map(e => e.id);
    expect(ids).toContain(marlinId);
    expect(ids).toContain(googleId);
    expect(ids).not.toContain(dateSpecificMarlinId);
  });

  it('modified_since=far-future excludes all events regardless of source', async () => {
    const res = await request.get('/api/events?source=marlin&modified_since=2099-01-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// API 404 guard
// ---------------------------------------------------------------------------

describe('API 404 guard', () => {
  it('returns JSON 404 for an unmatched /api path, not the SPA', async () => {
    const res = await request.get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('Not found');
  });

  it('does not swallow non-API paths', async () => {
    const res = await request.get('/some/spa/route');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:id
// ---------------------------------------------------------------------------

describe('GET /api/events/:id', () => {
  it('returns the single event as JSON', async () => {
    const created = await request.post('/api/events').send({
      title: 'Fetch me by id', date: '2026-08-15',
    });
    const id = created.body.id;
    const res = await request.get(`/api/events/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.id).toBe(id);
    expect(res.body.title).toBe('Fetch me by id');
  });

  it('404s for an unknown id', async () => {
    const res = await request.get('/api/events/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
