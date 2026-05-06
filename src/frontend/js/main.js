// Load config first (populates category select), then events, then draw
loadConfig()
  .then(() => loadEvents())
  .then(() => draw(DAY_SPACING(), 0))
  .catch(err => console.error('Startup failed:', err));
