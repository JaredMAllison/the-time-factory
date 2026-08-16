const express = require('express');
const path    = require('path');
const fs      = require('fs');

// Load config, fall back to defaults if setup hasn't been run
const configDefaults = { port: 3000, host: '0.0.0.0', displayName: 'My Time Factory', theme: 'default' };
let config = { ...configDefaults };
const configPath = path.join(__dirname, 'config', 'config.json');
if (fs.existsSync(configPath)) {
  try {
    config = { ...configDefaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch (err) {
    console.warn(`Warning: config/config.json is malformed. Using defaults. (${err.message})`);
  }
} else {
  console.log('No config found. Run "npm run setup" first.');
}

const app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self' http://localhost:8080");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// Parse incoming JSON request bodies
app.use(express.json());

// Serve the frontend files
app.use(express.static(path.join(__dirname, 'src', 'frontend')));

// API routes
app.use('/api/events', require('./src/backend/routes/events'));
app.set('config', config);
app.set('configPath', configPath);
app.use('/api/sync',   require('./src/backend/routes/sync'));

const DEFAULT_CATEGORIES = [
  { name: 'Self-Care',      color: '#4fc3f7' },
  { name: 'Community',      color: '#ab47bc' },
  { name: 'Productivity',   color: '#ffb300' },
  { name: 'Infrastructure', color: '#4db6ac' },
  { name: 'Personal',       color: '#81c784' },
];

app.get('/api/config', (req, res) => {
  res.json({
    displayName:  config.displayName  || 'My Time Factory',
    soundEnabled: config.soundEnabled !== false,
    categories:   config.categories   || DEFAULT_CATEGORIES,
  });
});

// Unmatched API paths must 404 as JSON. Without this the SPA catch-all below
// returns index.html with HTTP 200 for any bad /api/* path — a false success
// that health checks pass and callers parse as data.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// All other requests serve the frontend (allows future client-side routing)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'frontend', 'index.html'));
});

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    console.log(`\nThe Time Factory is running.`);
    console.log(`Open your browser to: http://localhost:${config.port}\n`);
  });
}

module.exports = app;
