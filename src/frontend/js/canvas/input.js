// ─── Resize ───────────────────────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  placementCache = {};  // geometry changed; cached relative offsets are stale
}
window.addEventListener('resize', resize);
resize();

// Click starts the intro animation and audio (browsers require a user gesture for sound)
let animationId = null;
let started = false;
document.addEventListener('click', () => {
  if (!started) {
    started = true;
    animationId = requestAnimationFrame(animate);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(animationId);
    animationId = null;
  } else if (started && animationId === null) {
    animationId = requestAnimationFrame(animate);
  }
});

// ─── Scroll input ─────────────────────────────────────────────────────────────

// Arrow keys: step one day at a time
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  navigate(-1);
  if (e.key === 'ArrowRight') navigate( 1);
});

// Mouse drag: free-scroll the belt, snap to nearest day on release.
// dragged flag suppresses the balloon tag click that would fire after a drag.
let dragStartX      = null;
let dragStartOffset = null;
let dragged         = false;

canvas.addEventListener('mousedown', e => {
  dragStartX      = e.clientX;
  dragStartOffset = scrollOffset;
  dragged         = false;
});

document.addEventListener('mousemove', e => {
  if (dragStartX === null) return;
  const delta = e.clientX - dragStartX;
  if (Math.abs(delta) > 4) dragged = true;
  scrollOffset       = dragStartOffset + delta;
  targetScrollOffset = scrollOffset;
});

document.addEventListener('mouseup', () => {
  if (dragStartX === null) return;
  dragStartX = null;
  if (dragged) navigate(0);  // snap to nearest day
});

// Suppress tag click when the user was dragging rather than tapping
canvas.addEventListener('click', e => { if (dragged) e.stopImmediatePropagation(); }, true);

// Touch: same behaviour as mouse drag
let touchStartX      = null;
let touchStartOffset = null;
let touchDragged     = false;

canvas.addEventListener('touchstart', e => {
  touchStartX      = e.touches[0].clientX;
  touchStartOffset = scrollOffset;
  touchDragged     = false;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (touchStartX === null) return;
  const delta = e.touches[0].clientX - touchStartX;
  if (Math.abs(delta) > 4) touchDragged = true;
  scrollOffset       = touchStartOffset + delta;
  targetScrollOffset = scrollOffset;
}, { passive: false });

document.addEventListener('touchend', () => {
  if (touchStartX === null) return;
  touchStartX = null;
  navigate(0);
});
