const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// Ensure the data directory exists (skipped for in-memory test databases)
const dataDir = path.join(__dirname, '../../../data');
const dbPath  = process.env.DB_PATH || path.join(dataDir, 'events.db');
if (dbPath !== ':memory:' && !fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(dbPath);

// Create events table on first run
// Fields map to iCalendar properties so future export/import is straightforward
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,   -- iCal UID
    title       TEXT NOT NULL,      -- iCal SUMMARY
    date        TEXT NOT NULL,      -- iCal DTSTART date (YYYY-MM-DD)
    start_time  TEXT,               -- iCal DTSTART time (HH:MM), null = all-day
    end_date    TEXT,               -- iCal DTEND date (YYYY-MM-DD, null = single day)
    end_time    TEXT,               -- iCal DTEND time (HH:MM)
    description TEXT,               -- iCal DESCRIPTION
    category    TEXT,               -- custom: drives tag color
    urgency     INTEGER DEFAULT 0,  -- custom: drives balloon color (0=low, 3=critical)
    created_at  TEXT NOT NULL,      -- iCal CREATED
    updated_at  TEXT NOT NULL       -- iCal LAST-MODIFIED
  )
`);

// Migrate existing databases that predate start_time/end_time columns
try { db.exec(`ALTER TABLE events ADD COLUMN start_time TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE events ADD COLUMN end_time TEXT`); } catch(e) {}
// Migrate: completed_at (iCal VTODO COMPLETED — null = active, ISO timestamp = done)
try { db.exec(`ALTER TABLE events ADD COLUMN completed_at TEXT`); } catch(e) {}
// Migrate: calendar sync columns
try { db.exec(`ALTER TABLE events ADD COLUMN external_id TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE events ADD COLUMN source TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE events ADD COLUMN source_updated_at TEXT`); } catch(e) {}
// Migrate: recurrence — RFC 5545 seed + RRULE model
// rrule: RRULE string on the seed event (e.g. "FREQ=WEEKLY;BYDAY=MO"); null on one-off events
// recurrence_id: FK to seed event id for exception instances; null on seeds and one-off events
try { db.exec(`ALTER TABLE events ADD COLUMN rrule TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE events ADD COLUMN recurrence_id TEXT`); } catch(e) {}

// Key/value store for sync state (last_synced_at, last_sync_error)
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  )
`);

module.exports = db;
