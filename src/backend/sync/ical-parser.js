// ─── Lightweight iCal VEVENT parser ───────────────────────────────────────────
// Parses the text of a VCALENDAR/.ics file and returns an array of event objects
// shaped to match the local DB schema.

function unfoldLines(text) {
  // iCal line folding: CRLF followed by a space or tab is a continuation
  return text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseDate(val) {
  // DATE-TIME: 20260325T143000Z or 20260325T143000
  // DATE:       20260325
  if (!val) return { date: null, time: null };
  const v = val.split(';').pop(); // strip TZID= etc
  const datePart = v.slice(0, 8);
  const timePart = v.length > 8 ? v.slice(9, 15) : null;
  const date = `${datePart.slice(0,4)}-${datePart.slice(4,6)}-${datePart.slice(6,8)}`;
  const time = timePart ? `${timePart.slice(0,2)}:${timePart.slice(2,4)}` : null;
  return { date, time };
}

function unescapeIcal(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseVEvents(text) {
  const lines  = unfoldLines(text).split('\n');
  const events = [];
  let current  = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT')   { if (current) events.push(current); current = null; continue; }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).toUpperCase();
    const val = line.slice(colon + 1);

    current[key] = val;
  }

  return events.map(ev => {
    const dtstart = parseDate(ev['DTSTART'] || ev[Object.keys(ev).find(k => k.startsWith('DTSTART;')) || '']);
    const dtend   = parseDate(ev['DTEND']   || ev[Object.keys(ev).find(k => k.startsWith('DTEND;'))   || '']);

    // Detect all-day: DTSTART with no time component (just DATE value)
    const rawStart = ev['DTSTART'] || Object.keys(ev).find(k => k.startsWith('DTSTART;')) && ev[Object.keys(ev).find(k => k.startsWith('DTSTART;'))];
    const isAllDay = rawStart && (rawStart.length === 8 || rawStart.includes('VALUE=DATE'));

    // iCal all-day DTEND is exclusive (next day), adjust back one day
    let endDate = dtend.date;
    if (isAllDay && endDate && endDate !== dtstart.date) {
      const d = new Date(endDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      endDate = d.toISOString().slice(0, 10);
      if (endDate === dtstart.date) endDate = null; // single-day all-day
    }

    return {
      external_id:        (ev['UID'] || '').trim(),
      title:              unescapeIcal((ev['SUMMARY'] || 'Untitled').trim()),
      date:               dtstart.date,
      start_time:         isAllDay ? null : dtstart.time,
      end_date:           endDate || null,
      end_time:           isAllDay ? null : (dtend.time || null),
      description:        ev['DESCRIPTION'] ? unescapeIcal(ev['DESCRIPTION'].trim()) : null,
      category:           ev['CATEGORIES'] ? ev['CATEGORIES'].split(',')[0].trim() : null,
      urgency:            0,
      source_updated_at:  ev['LAST-MODIFIED'] || ev['DTSTAMP'] || null,
    };
  }).filter(e => e.date); // drop events without a parseable date
}

module.exports = { parseVEvents };
