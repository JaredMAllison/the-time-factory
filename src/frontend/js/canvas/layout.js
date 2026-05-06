// ─── Layout helpers ───────────────────────────────────────────────────────────
// Screen zones (fixed to screen):
//   [ LEFT preview | ===== CENTER inspection zone ===== | RIGHT preview ]
//   0           CENTER_L                             CENTER_R         canvas.width
//
// The belt scrolls; which day is in the center zone changes with scrollOffset.
// centerDay = Math.round(-scrollOffset / DAY_SPACING())
//
// DAY_SPACING = distance between adjacent day centers = ZONE_W

// All three zones are equal width, so DAY_SPACING = ZONE_W.
const ZONE_W     = () => canvas.width / 3;
const PREVIEW_W  = () => ZONE_W();
const CENTER_L   = () => ZONE_W();
const CENTER_R   = () => ZONE_W() * 2;
const CENTER_W   = () => ZONE_W();
const BELT_Y     = () => canvas.height - visualProfile.belt.height;
const DAY_SPACING = () => ZONE_W();

// Screen X of a day's center given its offset from today and current scroll
function dayCenterX(dayOffset, scrollOffset) {
  return canvas.width / 2 + dayOffset * DAY_SPACING() + scrollOffset;
}
