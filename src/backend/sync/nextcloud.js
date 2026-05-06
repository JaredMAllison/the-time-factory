// ─── NextCloud Calendar sync (CalDAV bidirectional via tsdav) ─────────────────
const { DAVClient }    = require('tsdav');
const { randomUUID }   = require('crypto');
const { parseVEvents } = require('./ical-parser');

function buildVEvent(event) {
  const uid  = event.external_id || event.id;
  const now  = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'') + 'Z';

  const dtstart = event.start_time
    ? `DTSTART:${event.date.replace(/-/g,'')}T${event.start_time.replace(':','')}00`
    : `DTSTART;VALUE=DATE:${event.date.replace(/-/g,'')}`;

  let dtend = '';
  if (event.end_time && event.end_date) {
    dtend = `DTEND:${event.end_date.replace(/-/g,'')}T${event.end_time.replace(':','')}00`;
  } else if (event.end_time) {
    dtend = `DTEND:${event.date.replace(/-/g,'')}T${event.end_time.replace(':','')}00`;
  } else if (event.end_date) {
    // All-day multi-day: DTEND is exclusive (next day after end_date)
    const d = new Date(event.end_date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    dtend = `DTEND;VALUE=DATE:${d.toISOString().slice(0,10).replace(/-/g,'')}`;
  } else if (!event.start_time) {
    // All-day single: DTEND = next day
    const d = new Date(event.date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    dtend = `DTEND;VALUE=DATE:${d.toISOString().slice(0,10).replace(/-/g,'')}`;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Time Factory//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    dtstart,
    dtend,
    `SUMMARY:${(event.title || '').replace(/\n/g,'\\n')}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${event.description.replace(/\n/g,'\\n')}`);
  if (event.category)    lines.push(`CATEGORIES:${event.category}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

async function syncNextcloud(db, config, lastSyncedAt) {
  if (!config.nextcloud || !config.nextcloud.url || !config.nextcloud.username) {
    return { synced: 0, pushed: 0, skipped: 0 };
  }

  const { username, appPassword, calendarPath } = config.nextcloud;

  // tsdav needs the DAV endpoint, not the NextCloud root.
  // Normalize: if the URL doesn't already contain /dav, append /remote.php/dav
  let url = config.nextcloud.url.replace(/\/$/, '');
  if (!/\/remote\.php\/dav/.test(url) && !/\/dav$/.test(url)) {
    url = url + '/remote.php/dav';
  }

  const client = new DAVClient({
    serverUrl:          url,
    credentials:        { username, password: appPassword },
    authMethod:         'Basic',
    defaultAccountType: 'caldav',
  });

  await client.login();

  // Resolve calendar — use configured path or auto-discover first calendar
  let calendarUrl = calendarPath
    ? url.replace(/\/$/, '') + calendarPath
    : null;

  if (!calendarUrl) {
    const calendars = await client.fetchCalendars();
    if (!calendars.length) throw new Error('No calendars found on NextCloud server');
    calendarUrl = calendars[0].url;
  }

  // ── Pull: fetch all calendar objects ──────────────────────────────────────
  const objects = await client.fetchCalendarObjects({ calendar: { url: calendarUrl } });
  const now     = new Date().toISOString();
  let synced = 0, pushed = 0, skipped = 0;

  for (const obj of objects) {
    if (!obj.data) { skipped++; continue; }
    const parsed = parseVEvents(obj.data);
    if (!parsed.length) { skipped++; continue; }
    const ev = parsed[0];
    if (!ev.external_id || !ev.date) { skipped++; continue; }

    const existing = db.prepare('SELECT * FROM events WHERE external_id = ? AND source = ?')
                       .get(ev.external_id, 'nextcloud');

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
        start_time:       ev.start_time  || null,
        end_date:         ev.end_date    || null,
        end_time:         ev.end_time    || null,
        description:      ev.description || null,
        category:         ev.category    || null,
        urgency:          0,
        created_at:       now,
        updated_at:       now,
        external_id:      ev.external_id,
        source:           'nextcloud',
        source_updated_at: ev.source_updated_at || null,
      });
      synced++;
    } else if (ev.source_updated_at && ev.source_updated_at !== existing.source_updated_at) {
      // External changed — overwrite local
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
        start_time:       ev.start_time  || null,
        end_date:         ev.end_date    || null,
        end_time:         ev.end_time    || null,
        description:      ev.description || null,
        category:         ev.category    || null,
        updated_at:       now,
        source_updated_at: ev.source_updated_at,
      });
      synced++;
    } else {
      skipped++;
    }
  }

  // ── Push: local events modified since last sync ───────────────────────────
  const localNew      = db.prepare(`SELECT * FROM events WHERE source IS NULL AND external_id IS NULL`).all();
  const localModified = lastSyncedAt
    ? db.prepare(`SELECT * FROM events WHERE source = 'nextcloud' AND updated_at > ?`).all(lastSyncedAt)
    : [];

  for (const event of [...localNew, ...localModified]) {
    const uid     = event.external_id || event.id;
    const ical    = buildVEvent({ ...event, external_id: uid });
    const objUrl  = calendarUrl.replace(/\/$/, '') + `/${uid}.ics`;

    try {
      await client.createCalendarObject({
        calendar:    { url: calendarUrl },
        filename:    `${uid}.ics`,
        iCalString:  ical,
      });
      db.prepare(`UPDATE events SET external_id = @uid, source = 'nextcloud', updated_at = @now WHERE id = @id`)
        .run({ uid, now, id: event.id });
      pushed++;
    } catch (err) {
      // If it already exists, update instead
      if (err.status === 412 || err.status === 409) {
        try {
          await client.updateCalendarObject({ calendarObject: { url: objUrl, data: ical, etag: '' } });
          pushed++;
        } catch (updateErr) {
          skipped++;
        }
      } else {
        skipped++;
      }
    }
  }

  return { synced, pushed, skipped };
}

module.exports = { syncNextcloud };
