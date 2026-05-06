// ─── Animation loop ───────────────────────────────────────────────────────────
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

let scrollOffset       = 0;
let targetScrollOffset = 0;   // destination; scrollOffset eases toward this
let loadedCenterDay    = 0;   // which centerDay the events array currently covers
let bobTime            = 0;
let introState         = 'pending';
const INTRO_DURATION   = 1800;
let introStart         = null;

// Move the center day by dir steps (-1 = past, +1 = future, 0 = snap only).
// Reloads event data whenever the center day changes.
function navigate(dir) {
  placementCache = {};
  const cur  = Math.round(-scrollOffset / DAY_SPACING());
  const next = cur + dir;
  targetScrollOffset = -next * DAY_SPACING();
  if (next !== loadedCenterDay) {
    loadedCenterDay = next;
    loadEvents(next);
  }
}

// Reload events using the currently loaded center day.
// ui.js calls this after mutations so the fetch window matches the user's scroll position.
window.reloadEvents = function() { return loadEvents(loadedCenterDay); };

// Jump directly to a day offset (0 = today). Called by ui.js warp panel.
window.warpToDay = function(dayOffset) {
  placementCache = {};
  targetScrollOffset = -dayOffset * DAY_SPACING();
  if (dayOffset !== loadedCenterDay) {
    loadedCenterDay = dayOffset;
    loadEvents(dayOffset);
  }
};

function animate(timestamp) {
  bobTime = timestamp / visualProfile.balloon.bobSpeed;

  if (introState === 'pending') {
    scrollOffset       = DAY_SPACING();
    targetScrollOffset = 0;
    introState         = 'advancing';
    introStart         = timestamp;
    if (appConfig && appConfig.soundEnabled) playIntroSounds(INTRO_DURATION);
  }

  if (introState === 'advancing') {
    const progress = Math.min((timestamp - introStart) / INTRO_DURATION, 1);
    scrollOffset   = DAY_SPACING() - DAY_SPACING() * easeInOut(progress);
    if (progress >= 1) { scrollOffset = 0; introState = 'done'; }
  }

  // After intro: ease toward the snap target (set by navigate / drag release)
  if (introState === 'done') {
    const diff = targetScrollOffset - scrollOffset;
    if (Math.abs(diff) > 0.5) scrollOffset += diff * 0.15;
    else                       scrollOffset  = targetScrollOffset;
  }

  draw(scrollOffset, bobTime);
  animationId = requestAnimationFrame(animate);
}
