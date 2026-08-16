const express = require('express');
const { randomUUID } = require('crypto');
const db      = require('../db/database');
const router  = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
// RRULE must begin with FREQ= and one of the four standard frequencies
const RRULE_RE = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/;

function validateEvent(body, requireTitle = true) {
  const errors = [];
  if (requireTitle) {
    if (!body.title || typeof body.title !== 'string') errors.push('title is required and must be a string');
    else if (body.title.length > 200) errors.push('title must be 200 characters or fewer');
    if (!body.date) errors.push('date is required');
  }
  if (body.date !== undefined && !DATE_RE.test(body.date)) errors.push('date must be in YYYY-MM-DD format');
  if (body.end_date !== undefined && body.end_date !== null && !DATE_RE.test(body.end_date)) errors.push('end_date must be in YYYY-MM-DD format');
  if (body.start_time !== undefined && body.start_time !== null && !TIME_RE.test(body.start_time)) errors.push('start_time must be in HH:MM format');
  if (body.end_time !== undefined && body.end_time !== null && !TIME_RE.test(body.end_time)) errors.push('end_time must be in HH:MM format');
  if (body.urgency !== undefined && body.urgency !== null) {
    const u = Number(body.urgency);
    if (!Number.isInteger(u) || u < 0 || u > 3) errors.push('urgency must be an integer between 0 and 3');
  }
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== 'string') errors.push('category must be a string');
    else if (body.category.length > 100) errors.push('category must be 100 characters or fewer');
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') errors.push('description must be a string');
    else if (body.description.length > 2000) errors.push('description must be 2000 characters or fewer');
  }
  if (body.completed_at !== undefined && body.completed_at !== null && typeof body.completed_at !== 'string') {
    errors.push('completed_at must be null or an ISO timestamp string');
  }
  if (body.rrule !== undefined && body.rrule !== null) {
    if (typeof body.rrule !== 'string') errors.push('rrule must be a string');
    else if (!RRULE_RE.test(body.rrule)) errors.push('rrule must begin with FREQ=DAILY|WEEKLY|MONTHLY|YEARLY');
    else if (body.rrule.length > 500) errors.push('rrule must be 500 characters or fewer');
  }
  if (body.recurrence_id !== undefined && body.recurrence_id !== null) {
    if (!UUID_RE.test(body.recurrence_id)) errors.push('recurrence_id must be a valid UUID');
  }
  return errors.length ? { errors } : null;
}

// GET /api/events
//
// Query parameters (at least one filter group required):
//   from + to   (YYYY-MM-DD) — return events overlapping the date range, plus recurrence
//               seeds started before `to` (frontend expands these into instances).
//               Both must be provided together.
//   modified_since (ISO timestamp) — return events whose updated_at >= this value.
//               Useful for incremental reconciliation without a date window.
//   source      (string, optional) — filter by the source column (e.g. "marlin").
//
// At least one of from+to or modified_since is required. Returns 400 otherwise.
router.get('/', (req, res) => {
  const { from, to, source, modified_since } = req.query;

  // from and to must appear together
  if ((from && !to) || (!from && to)) {
    return res.status(400).json({ error: 'from and to must both be provided together' });
  }
  // validate date format if present
  if (from && (!DATE_RE.test(from) || !DATE_RE.test(to))) {
    return res.status(400).json({ error: 'from and to must be in YYYY-MM-DD format' });
  }
  // validate modified_since if present
  if (modified_since !== undefined && isNaN(new Date(modified_since))) {
    return res.status(400).json({ error: 'modified_since must be a valid ISO timestamp' });
  }
  // require at least one filter
  if (!from && modified_since === undefined) {
    return res.status(400).json({ error: 'Provide from+to date range, modified_since timestamp, or both' });
  }

  try {
    const conditions = [];
    const params     = [];

    if (from && to) {
      conditions.push(`(
        (rrule IS NULL AND date <= ? AND (end_date >= ? OR (end_date IS NULL AND date >= ?)))
        OR (rrule IS NOT NULL AND date <= ?)
      )`);
      params.push(to, from, from, to);
    }
    if (modified_since !== undefined) {
      conditions.push('updated_at >= ?');
      params.push(modified_since);
    }
    if (source !== undefined) {
      conditions.push('source = ?');
      params.push(source);
    }

    const rows = db.prepare(
      `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY date ASC`
    ).all(...params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/events
// Creates a new event
router.post('/', (req, res) => {
  const validationError = validateEvent(req.body, true);
  if (validationError) return res.status(400).json(validationError);

  const {
    title, date, start_time, end_date, end_time, description, category, urgency, rrule, recurrence_id,
    external_id, source, source_updated_at,
  } = req.body;
  const now   = new Date().toISOString();
  const event = {
    id:             randomUUID(),
    title,
    date,
    start_time:     start_time     || null,
    end_date:       end_date       || null,
    end_time:       end_time       || null,
    description:    description    || null,
    category:       category       || null,
    urgency:        urgency        ?? 0,
    rrule:          rrule          || null,
    recurrence_id:  recurrence_id  || null,
    // Sync provenance. Callers that own the record elsewhere (the Marlin vault's
    // /ttf-push, an importer) send these so the TTF→origin back-reference exists
    // from creation. Absent means null, which is what the Nextcloud push-out
    // treats as "locally authored, not yet mirrored" — same as PUT leaving them
    // untouched and the sync engines defaulting source_updated_at to null.
    external_id:       external_id       || null,
    source:            source            || null,
    source_updated_at: source_updated_at || null,
    created_at:     now,
    updated_at:     now,
  };
  try {
    db.prepare(`
      INSERT INTO events (id, title, date, start_time, end_date, end_time, description, category, urgency, rrule, recurrence_id, external_id, source, source_updated_at, created_at, updated_at)
      VALUES (@id, @title, @date, @start_time, @end_date, @end_time, @description, @category, @urgency, @rrule, @recurrence_id, @external_id, @source, @source_updated_at, @created_at, @updated_at)
    `).run(event);
    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/events/:id — single event by id
router.get('/:id', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid event ID format' });
  }
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/events/:id
// Updates an existing event
router.put('/:id', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid event id format' });
  }
  const validationError = validateEvent(req.body, false);
  if (validationError) return res.status(400).json(validationError);

  let existing;
  try {
    existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  const ALLOWED_FIELDS = ['title','date','start_time','end_date','end_time','description','category','urgency','completed_at','external_id','source','source_updated_at','rrule','recurrence_id'];
  const patch = {};
  for (const k of ALLOWED_FIELDS) if (k in req.body) patch[k] = req.body[k];
  const updated = { ...existing, ...patch, id: existing.id, updated_at: new Date().toISOString() };

  try {
    db.prepare(`
      UPDATE events SET
        title = @title, date = @date, start_time = @start_time,
        end_date = @end_date, end_time = @end_time,
        description = @description, category = @category,
        urgency = @urgency, completed_at = @completed_at, updated_at = @updated_at,
        external_id = @external_id, source = @source, source_updated_at = @source_updated_at,
        rrule = @rrule, recurrence_id = @recurrence_id
      WHERE id = @id
    `).run(updated);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/events/:id[?mode=all|previous&before=YYYY-MM-DD]
//
// No mode (default): delete this single event — existing behaviour unchanged.
//
// ?mode=all: delete the entire recurring series.
//   Removes the seed event and every exception instance that points back to it.
//
// ?mode=previous&before=YYYY-MM-DD: cut off past occurrences.
//   Advances the seed's DTSTART to `before`, so the series now starts from that date.
//   Also removes any exception instances whose date falls before `before`.
//   Returns { updated: id, deleted_exceptions: N }.
router.delete('/:id', (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid event ID format' });
  }
  const { mode, before } = req.query;

  if (mode === 'all') {
    try {
      const result = db.prepare(
        'DELETE FROM events WHERE id = ? OR recurrence_id = ?'
      ).run(req.params.id, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Event not found' });
      res.json({ deleted: req.params.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
    return;
  }

  if (mode === 'previous') {
    if (!before || !DATE_RE.test(before)) {
      return res.status(400).json({ error: 'before param required and must be YYYY-MM-DD when mode=previous' });
    }
    try {
      const now = new Date().toISOString();
      // Advance the seed's start date so past occurrences are no longer generated
      const seedResult = db.prepare(
        'UPDATE events SET date = ?, updated_at = ? WHERE id = ?'
      ).run(before, now, req.params.id);
      if (seedResult.changes === 0) return res.status(404).json({ error: 'Event not found' });
      // Remove any exception instances that fell before the new start
      const exceptResult = db.prepare(
        'DELETE FROM events WHERE recurrence_id = ? AND date < ?'
      ).run(req.params.id, before);
      res.json({ updated: req.params.id, deleted_exceptions: exceptResult.changes });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
    return;
  }

  // Default: delete a single event
  try {
    const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
module.exports.validateEvent = validateEvent;
