// ─── Sync API routes ───────────────────────────────────────────────────────────
const express          = require('express');
const fs               = require('fs');
const path             = require('path');
const { runSync, getStatus } = require('../sync/engine');
const router           = express.Router();

// POST /api/sync — trigger a full sync
router.post('/', async (req, res) => {
  try {
    const config = req.app.get('config');
    if (!config.google?.icalUrl && !config.nextcloud?.url) {
      return res.status(400).json({ error: 'No sync sources configured in config.json' });
    }
    const result = await runSync(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/settings — return current (non-secret) sync settings for the UI
router.get('/settings', (req, res) => {
  const config = req.app.get('config');
  res.json({
    google:    { icalUrl: config.google?.icalUrl    || '' },
    nextcloud: {
      url:          config.nextcloud?.url          || '',
      username:     config.nextcloud?.username     || '',
      calendarPath: config.nextcloud?.calendarPath || '',
      // never return appPassword — write-only
    },
  });
});

// POST /api/sync/settings — write credentials to config.json and update live config
router.post('/settings', (req, res) => {
  const { service, settings } = req.body;
  if (!service || !settings) return res.status(400).json({ error: 'service and settings required' });

  const config     = req.app.get('config');
  const configPath = req.app.get('configPath');

  if (service === 'google') {
    config.google = { ...(config.google || {}), ...settings };
  } else if (service === 'nextcloud') {
    // Only update appPassword if a non-empty value was provided
    const merged = { ...(config.nextcloud || {}), ...settings };
    if (!settings.appPassword) delete merged.appPassword;
    else config.nextcloud = merged;
    config.nextcloud = merged;
  } else {
    return res.status(400).json({ error: 'Unknown service' });
  }

  // Write back to config.json if it exists; create it if not
  try {
    const dir = path.dirname(configPath);
    if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    req.app.set('config', config);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not write config.json: ' + err.message });
  }
});

// GET /api/sync/status — last sync time and any errors
router.get('/status', (req, res) => {
  const config      = req.app.get('config');
  const status      = getStatus();
  const configured  = [];
  if (config.google?.icalUrl)    configured.push('google');
  if (config.nextcloud?.url)     configured.push('nextcloud');
  res.json({ ...status, configured });
});

module.exports = router;
