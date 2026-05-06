// ─── Sync engine — orchestrates Google + NextCloud adapters ───────────────────
const db               = require('../db/database');
const { syncGoogle }   = require('./google');
const { syncNextcloud } = require('./nextcloud');

function getSyncState() {
  const row = db.prepare(`SELECT value FROM sync_state WHERE key = 'last_synced_at'`).get();
  return row ? row.value : null;
}

function setSyncState(lastSyncedAt, error) {
  db.prepare(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_synced_at', ?)`)
    .run(lastSyncedAt);
  db.prepare(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_sync_error', ?)`)
    .run(error || null);
}

async function runSync(config) {
  const lastSyncedAt = getSyncState();
  const results      = { google: null, nextcloud: null, errors: [] };

  if (config.google && config.google.icalUrl) {
    try {
      results.google = await syncGoogle(db, config);
    } catch (err) {
      results.errors.push(`Google: ${err.message}`);
    }
  }

  if (config.nextcloud && config.nextcloud.url) {
    try {
      results.nextcloud = await syncNextcloud(db, config, lastSyncedAt);
    } catch (err) {
      results.errors.push(`NextCloud: ${err.message}`);
    }
  }

  const now = new Date().toISOString();
  setSyncState(now, results.errors.length ? results.errors.join('; ') : null);

  return { ...results, syncedAt: now };
}

function getStatus() {
  const lastSyncedAt = db.prepare(`SELECT value FROM sync_state WHERE key = 'last_synced_at'`).get();
  const lastError    = db.prepare(`SELECT value FROM sync_state WHERE key = 'last_sync_error'`).get();
  return {
    lastSyncedAt:  lastSyncedAt ? lastSyncedAt.value : null,
    lastSyncError: lastError    ? lastError.value    : null,
  };
}

module.exports = { runSync, getStatus };
