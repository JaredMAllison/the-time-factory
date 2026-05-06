// ─── Google Calendar sync (read-only via secret iCal URL) ─────────────────────
const https        = require('https');
const { randomUUID } = require('crypto');
const { parseVEvents } = require('./ical-parser');

function fetchUrl(url) {
  if (!url.startsWith('https://')) throw new Error('Only HTTPS URLs are allowed');
  return new Promise((resolve, reject) => {
    const request = https.get(url, res => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) {
          request.destroy(new Error('Response too large (>10MB)'));
        }
      });
      res.on('end', () => resolve(body));
    }).on('error', reject);
    request.setTimeout(30_000, () => { request.destroy(new Error('timeout')); });
  });
}

async function syncGoogle(db, config) {
  if (!config.google || !config.google.icalUrl) return { synced: 0, skipped: 0, errors: [] };

  let ical;
  try {
    ical = await fetchUrl(config.google.icalUrl);
  } catch (err) {
    return { synced: 0, skipped: 0, errors: [err.message] };
  }

  const events = parseVEvents(ical);
  let synced = 0, skipped = 0;

  const now = new Date().toISOString();

  for (const ev of events) {
    if (!ev.external_id || !ev.date) { skipped++; continue; }

    const existing = db.prepare('SELECT * FROM events WHERE external_id = ? AND source = ?')
                       .get(ev.external_id, 'google');

    if (!existing) {
      db.prepare(`
        INSERT INTO events
          (id, title, date, start_time, end_date, end_time, description, category,
           urgency, created_at, updated_at, external_id, source, source_updated_at)
        VALUES
          (@id, @title, @date, @start_time, @end_date, @end_time, @description, @category,
           @urgency, @created_at, @updated_at, @external_id, @source, @source_updated_at)
      `).run({
        id:               randomUUID(),
        title:            ev.title,
        date:             ev.date,
        start_time:       ev.start_time       || null,
        end_date:         ev.end_date         || null,
        end_time:         ev.end_time         || null,
        description:      ev.description      || null,
        category:         ev.category         || null,
        urgency:          0,
        created_at:       now,
        updated_at:       now,
        external_id:      ev.external_id,
        source:           'google',
        source_updated_at: ev.source_updated_at || null,
      });
      synced++;
    } else if (ev.source_updated_at && ev.source_updated_at !== existing.source_updated_at) {
      // External event changed — overwrite local (read-only source, external always wins)
      db.prepare(`
        UPDATE events SET
          title = @title, date = @date, start_time = @start_time,
          end_date = @end_date, end_time = @end_time, description = @description,
          category = @category, updated_at = @updated_at,
          source_updated_at = @source_updated_at
        WHERE id = @id
      `).run({
        id:               existing.id,
        title:            ev.title,
        date:             ev.date,
        start_time:       ev.start_time       || null,
        end_date:         ev.end_date         || null,
        end_time:         ev.end_time         || null,
        description:      ev.description      || null,
        category:         ev.category         || null,
        updated_at:       now,
        source_updated_at: ev.source_updated_at,
      });
      synced++;
    } else {
      skipped++;
    }
  }

  return { synced, skipped, errors: [] };
}

module.exports = { syncGoogle };
