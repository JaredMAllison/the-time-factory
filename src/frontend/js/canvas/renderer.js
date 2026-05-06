// ─── Time → float height mapping ─────────────────────────────────────────────
const DAY_FLOOR_MINUTES   = 6 * 60;  // 6:00 AM
const DAY_CEILING_MINIMUM = 19 * 60; // 7:00 PM — ceiling never goes below this

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Compute the time range for a given day — floor is always 6AM,
// ceiling is the later of 7PM or the latest event end time that day
function computeDayRange(dayOffset) {
  const timedEvents = eventsForDay(dayOffset).filter(e => e.start_time);
  const ceiling = timedEvents.reduce((max, e) => {
    const mins = timeToMinutes(e.end_time) ?? timeToMinutes(e.start_time);
    return Math.max(max, mins ?? 0);
  }, DAY_CEILING_MINIMUM);
  return { floor: DAY_FLOOR_MINUTES, ceiling };
}

// The highest a balloon can float — just below the station frame label
function maxFloatHeight() {
  const s = visualProfile.station;
  return BELT_Y() - (s.warningStripeH * 2 + s.frameWidth + 30) - visualProfile.balloon.radius;
}

// Convert an event's start_time to a float height above the belt
// All-day events park just above the belt; timed events scale with time of day
function computeFloatHeight(event, range) {
  const radius       = visualProfile.balloon.radius;
  const allDayFloat  = radius;           // balloon rests on the belt
  const firstFloat   = radius * 3;       // one balloon-diameter above belt = 6AM position

  if (!event.start_time) return allDayFloat;

  const mins = timeToMinutes(event.start_time);
  const t    = Math.max(0, Math.min(1, (mins - range.floor) / (range.ceiling - range.floor)));
  return firstFloat + t * (maxFloatHeight() - firstFloat);
}

// ─── Drawing: Belt ────────────────────────────────────────────────────────────
function drawBelt(scrollOffset) {
  const y = BELT_Y(), b = visualProfile.belt;
  ctx.fillStyle = b.color;
  ctx.fillRect(0, y, canvas.width, b.height);

  // Moving stripes
  ctx.strokeStyle = b.stripeColor; ctx.lineWidth = 1;
  const so = ((scrollOffset % b.stripeSpacing) + b.stripeSpacing) % b.stripeSpacing;
  for (let x = -b.stripeSpacing + so; x < canvas.width + b.stripeSpacing; x += b.stripeSpacing) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + b.stripeLength, y + b.height); ctx.stroke();
  }

  // Moving bolts
  ctx.fillStyle = b.boltColor;
  const bo = ((scrollOffset % b.boltSpacing) + b.boltSpacing) % b.boltSpacing;
  for (let x = bo; x < canvas.width; x += b.boltSpacing) {
    ctx.beginPath(); ctx.arc(x, y + 8, b.boltRadius, 0, Math.PI * 2); ctx.fill();
  }

  ctx.strokeStyle = b.edgeColor; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
}

// ─── Drawing: Station background ─────────────────────────────────────────────
function drawStationBackground() {
  const s = visualProfile.station, cl = CENTER_L(), cw = CENTER_W(), by = BELT_Y();
  ctx.fillStyle = s.floorColor;
  ctx.fillRect(cl, 0, cw, by);
  const grad = ctx.createRadialGradient(canvas.width / 2, 0, 0, canvas.width / 2, 0, cw * s.lampRadius);
  grad.addColorStop(0, s.lampColor); grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(cl, 0, cw, by);
}

// ─── Drawing: Station foreground frame ───────────────────────────────────────
function drawStationFrame(scrollOffset) {
  const s = visualProfile.station, cl = CENTER_L(), cr = CENTER_R(), cw = CENTER_W(), by = BELT_Y();

  // Warning stripes top band
  ctx.save(); ctx.beginPath(); ctx.rect(cl, 0, cw, s.warningStripeH * 2); ctx.clip();
  for (let i = 0; i < Math.ceil(cw / s.warningStripeH) * 2; i++) {
    ctx.fillStyle = i % 2 === 0 ? s.warningStripe1 : s.warningStripe2;
    ctx.fillRect(cl + i * s.warningStripeH - s.warningStripeH, 0, s.warningStripeH, s.warningStripeH * 2);
  }
  ctx.restore();

  // Frame pillars
  ctx.fillStyle = s.frameColor;
  ctx.fillRect(cl - s.frameWidth, 0, s.frameWidth, by);
  ctx.fillRect(cr, 0, s.frameWidth, by);
  ctx.fillRect(cl - s.frameWidth, s.warningStripeH * 2, cw + s.frameWidth * 2, s.frameWidth);

  // Rivets
  ctx.fillStyle = s.rivetColor;
  for (let y = s.warningStripeH * 2 + s.rivetSpacing; y < by - s.rivetSpacing; y += s.rivetSpacing) {
    ctx.beginPath(); ctx.arc(cl - s.frameWidth / 2, y, s.rivetRadius, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cr + s.frameWidth / 2, y, s.rivetRadius, 0, Math.PI * 2); ctx.fill();
  }

  // Label — shows actual date when the center zone is not today
  const centerDay  = Math.round(-scrollOffset / DAY_SPACING());
  const label = centerDay === 0
    ? 'INSPECTION ZONE — TODAY'
    : 'INSPECTION ZONE — ' + offsetDate(new Date(), centerDay)
        .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        .toUpperCase();
  ctx.fillStyle = s.labelColor; ctx.font = s.labelFont;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(label, canvas.width / 2, s.warningStripeH * 2 + s.frameWidth + 6);
}

// ─── Drawing: Preview overlays ────────────────────────────────────────────────
function drawPreviewOverlays() {
  const p = visualProfile.preview, cl = CENTER_L(), cr = CENTER_R(), by = BELT_Y();
  [{ x: 0, w: cl }, { x: cr, w: PREVIEW_W() }].forEach(({ x, w }) => {
    ctx.fillStyle = p.overlayColor; ctx.fillRect(x, 0, w, by);
    ctx.strokeStyle = p.meshColor; ctx.lineWidth = 1;
    for (let mx = x; mx < x + w; mx += p.meshSpacing) {
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, by); ctx.stroke();
    }
    for (let my = 0; my < by; my += p.meshSpacing) {
      ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x + w, my); ctx.stroke();
    }
  });

  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '11px monospace'; ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText('◀  PAST',    cl / 2,              30);
  ctx.fillText('FUTURE  ▶', cr + PREVIEW_W() / 2, 30);
}

// ─── Drawing: Day date labels ─────────────────────────────────────────────────
function drawDayLabels(scrollOffset) {
  const by     = BELT_Y();
  const fmt    = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const center = Math.round(-scrollOffset / DAY_SPACING());

  // Label the 3 visible days (center ±1); today's label is brighter
  [center - 1, center, center + 1].forEach(dayOffset => {
    const cx = dayCenterX(dayOffset, scrollOffset);
    ctx.fillStyle = dayOffset === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
    ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fmt(offsetDate(new Date(), dayOffset)), cx, by - 12);
  });
}

// ─── Balloon placement cache helpers ─────────────────────────────────────────
// Computes relative x positions (offsets from zone left bound) for a day's
// balloons. Stored as fractions of `usable` so the result is scroll-independent
// and can be cached until events change.
// isCenter controls the minDist spacing (center zone uses scale=1, preview uses
// previewScale). Cache key encodes both dayOffset and isCenter.
function computePlacementForDay(dayOffset, isCenter) {
  const v         = visualProfile.balloon;
  const zoneW     = ZONE_W();
  const padding   = zoneW * 0.12;
  const usable    = zoneW - padding * 2;
  const zoneScale = isCenter ? 1 : v.previewScale;
  const diameter  = v.radius * zoneScale * 2;
  const edgePad   = v.radius * zoneScale * 0.5;
  const dayEvents = eventsForDay(dayOffset);
  const range     = computeDayRange(dayOffset);

  // Minimum horizontal separation for two circles given their vertical separation.
  // When dy >= diameter they can't overlap regardless of x — no constraint needed.
  function minXDist(yA, yB) {
    const dy = Math.abs(yA - yB) * zoneScale;
    return dy >= diameter ? 0 : Math.sqrt(diameter * diameter - dy * dy);
  }

  // x and y stored as pixel offsets; x range [edgePad, usable - edgePad]
  const placed = dayEvents
    .map(event => ({
      event,
      x: edgePad + seededRandom(event.id) * Math.max(0, usable - edgePad * 2),
      y: computeFloatHeight(event, range),
    }))
    .sort((a, b) => a.x - b.x);
  for (let i = 1; i < placed.length; i++)
    placed[i].x = Math.max(placed[i].x, placed[i - 1].x + minXDist(placed[i].y, placed[i - 1].y));
  for (let i = placed.length - 2; i >= 0; i--)
    placed[i].x = Math.min(placed[i].x, placed[i + 1].x - minXDist(placed[i].y, placed[i + 1].y));

  // y is only needed during placement — strip it before caching
  return placed.map(({ event, x }) => ({ event, x }));
}

function getPlacedForDay(dayOffset, isCenter) {
  const key = `${dayOffset}:${isCenter ? 1 : 0}`;
  if (!placementCache[key]) {
    placementCache[key] = computePlacementForDay(dayOffset, isCenter);
  }
  return placementCache[key];
}

// ─── Drawing: Balloons for all days ──────────────────────────────────────────
function drawAllBalloons(scrollOffset, bobTime) {
  const v      = visualProfile.balloon;
  const center = Math.round(-scrollOffset / DAY_SPACING());
  // Render center ±2: the outer two days are just off-screen but keep
  // cross-strings intact for events that span the visible window edge.
  const days   = [center - 2, center - 1, center, center + 1, center + 2];

  // Phase 1: look up (or compute and cache) placed relative X positions for
  // all five day zones, then resolve to absolute screen coordinates.
  const placedByDay = {};
  days.forEach(dayOffset => {
    const dayEvents = eventsForDay(dayOffset);
    if (!dayEvents.length) { placedByDay[dayOffset] = []; return; }

    const isCenter  = dayOffset === center;
    const cx        = dayCenterX(dayOffset, scrollOffset);
    const zoneW     = ZONE_W();
    const padding   = zoneW * 0.12;
    const usable    = zoneW - padding * 2;
    const leftBound = cx - usable / 2;

    // Retrieve relative positions from cache (keyed on dayOffset + isCenter),
    // then shift to absolute screen x by adding leftBound.
    const relative = getPlacedForDay(dayOffset, isCenter);
    placedByDay[dayOffset] = relative.map(({ event, x }) => ({ event, x: leftBound + x }));
  });

  // Phase 2: draw cross-strings connecting sibling balloons across day zones.
  // Only multi-day events (same id spanning multiple days) get cross-strings.
  // Recurring instances share a seed id but are independent — skip them.
  const byId = {};
  days.forEach(d => {
    (placedByDay[d] || []).forEach(({ event, x }, i) => {
      if (event.rrule) return;
      if (!byId[event.id]) byId[event.id] = [];
      byId[event.id].push({ event, dayOffset: d, x, i });
    });
  });

  function siblingCenterY(event, x, index, dayOffset) {
    const inPreview   = x < CENTER_L() || x > CENTER_R();
    const scale       = inPreview ? v.previewScale : 1;
    const popped      = !!event.completed_at;
    const bobOffset   = popped ? 0 : Math.sin(bobTime + index * 0.9) * v.bobAmplitude * scale;
    const floatHeight = computeFloatHeight(event, computeDayRange(dayOffset));
    return BELT_Y() - floatHeight * scale + bobOffset;
  }

  Object.values(byId).filter(siblings => siblings.length > 1).forEach(siblings => {
    siblings.sort((a, b) => a.dayOffset - b.dayOffset);
    for (let i = 0; i < siblings.length - 1; i++) {
      const a = siblings[i], b = siblings[i + 1];
      ctx.save();
      ctx.strokeStyle = v.stringColor;
      ctx.lineWidth   = v.stringWidth;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(a.x, siblingCenterY(a.event, a.x, a.i, a.dayOffset));
      ctx.lineTo(b.x, siblingCenterY(b.event, b.x, b.i, b.dayOffset));
      ctx.stroke();
      ctx.restore();
    }
  });

  // Phase 3: draw strings + bodies, collect tag draw params
  const tagQueue = [];
  days.forEach(dayOffset => {
    const range = computeDayRange(dayOffset);
    (placedByDay[dayOffset] || []).forEach(({ event, x }, i) => {
      tagQueue.push(drawBalloonBody(event, x, computeFloatHeight(event, range), i, bobTime));
    });
  });

  // Phase 4: resolve tag Y overlaps — push conflicting tags down the string
  tagQueue.sort((a, b) => a.tagY - b.tagY);
  for (let i = 1; i < tagQueue.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = tagQueue[j], b = tagQueue[i];
      if (b.tagX < a.tagX + a.tagW && b.tagX + b.tagW > a.tagX &&
          b.tagY < a.tagY + a.tagH && b.tagY + b.tagH > a.tagY) {
        b.tagY = a.tagY + a.tagH + 2;
      }
    }
  }

  // Phase 5: draw all tags on top of every balloon body
  tagQueue.forEach(drawBalloonTag);
}

// ─── Pop animation timing + state ────────────────────────────────────────────
const POP_DART_MS = 200;   // ms until dart reaches balloon center
const POP_DONE_MS = 650;   // ms until deflation is complete

// Exposed so ui.js can delay reloadEvents() until the animation finishes.
window.POP_DONE_MS = POP_DONE_MS;

// Tracks in-progress pop transitions (eventId → performance.now() at pop)
const poppingAnimations = new Map();

// Called by ui.js immediately after a pop API call succeeds
window.startPopAnimation = function(instanceKey) {
  poppingAnimations.set(instanceKey, performance.now());
};

// ─── Dart ─────────────────────────────────────────────────────────────────────
// Draws a horizontal dart pinned at (cx, cy) — the balloon's apex.
// Left end (tip) is not drawn: it's embedded in the background wall.
// Flights and shaft extend to the right.
function drawDart(ctx, cx, cy, r, pinned = false) {
  // Horizontal: tip points left, tail points right
  // pinned=true: left half of shaft is embedded in background — only draw right half
  const shaftX = pinned ? cx : cx - r * 0.90;  // left end of visible shaft
  const tailX  = cx + r * 0.85;                 // right end — flights here
  const sw     = Math.max(2, r * 0.07);

  ctx.save();

  // Shaft — wood
  ctx.strokeStyle = '#8B6340';
  ctx.lineWidth   = sw;
  ctx.lineCap     = 'butt';
  ctx.beginPath();
  ctx.moveTo(shaftX, cy);
  ctx.lineTo(tailX, cy);
  ctx.stroke();

  // Flights — two red fins at tail, spreading up and down
  const fl = r * 0.42;
  const fw = r * 0.18;
  ctx.fillStyle = '#cc3333';
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(tailX, cy);
    ctx.lineTo(tailX + fl, cy + fw * side);
    ctx.lineTo(tailX + fl * 0.45, cy);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ─── Pop transition animation ─────────────────────────────────────────────────
// Phase 1 (0–POP_DART_MS): dart flies in horizontally from the right, targeting
//   the balloon's apex (cx, cy - radius). Balloon stays intact.
// Phase 2 (POP_DART_MS–POP_DONE_MS): top edge stays pinned at the apex;
//   balloon collapses downward — deflates vertically into hanging skin.
function drawPopAnimation(ctx, cx, cy, radius, color, elapsed) {
  const v      = visualProfile.balloon;
  const apexY  = cy - radius;   // where the dart pins the balloon

  if (elapsed < POP_DART_MS) {
    // Balloon intact
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = v.shineColor;
    ctx.fill();

    // Dart flies in horizontally from the right toward the apex
    const t     = elapsed / POP_DART_MS;
    const eased = 1 - (1 - t) * (1 - t);   // ease-out quad
    const dartCX = cx + radius * 7 * (1 - eased);
    drawDart(ctx, dartCX, apexY, radius);

  } else {
    // Top edge pinned at apexY; balloon collapses downward
    const t = Math.min(1, (elapsed - POP_DART_MS) / (POP_DONE_MS - POP_DART_MS));

    // Brief outward reaction at impact (0→5%), then smooth vertical collapse
    const k = t < 0.05
      ? 1 + (t / 0.05) * 0.08                        // expand to 1.08×
      : 1.08 - ((t - 0.05) / 0.95) * 0.48;           // collapse to 0.60×
    const ry      = radius * k;
    const rx      = t < 0.05
      ? radius * (1 + (t / 0.05) * 0.05)
      : radius * (1.05 - ((t - 0.05) / 0.95) * 0.50);
    const centerY = apexY + ry;                       // top edge = apexY throughout

    ctx.save();
    ctx.globalAlpha *= Math.max(0, 1 - t * 0.50);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, centerY, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawDart(ctx, cx, apexY, radius, true);
  }
}

// ─── Popped balloon visual (static resting state) ─────────────────────────────
// Dart pinned at the balloon's apex; deflated skin hangs down from it.
// The time metaphor is preserved: the remnant stays where the event was.
function drawPoppedBalloon(ctx, cx, cy, radius, color) {
  const apexY  = cy - radius;          // dart pin point — top of original balloon
  const skinW  = radius * 0.55;        // max width of hanging skin
  const skinH  = radius * 1.35;        // how far skin hangs below dart

  // Deflated skin — teardrop shape hanging from dart point
  ctx.save();
  ctx.globalAlpha *= 0.50;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, apexY);
  ctx.bezierCurveTo(cx + skinW,        apexY + skinH * 0.35,
                    cx + skinW * 0.45, apexY + skinH,
                    cx,                apexY + skinH);
  ctx.bezierCurveTo(cx - skinW * 0.45, apexY + skinH,
                    cx - skinW,        apexY + skinH * 0.35,
                    cx,                apexY);
  ctx.fill();
  ctx.restore();

  drawDart(ctx, cx, apexY, radius, true);
}

// Draws string + body; returns tag params for a deferred top-layer pass.
function drawBalloonBody(event, anchorX, floatHeight, index, bobTime) {
  const v  = visualProfile.balloon;
  const t  = visualProfile.tag;
  const by = BELT_Y();

  // Scale and alpha based on physical screen position, not day ownership
  const inPreview = anchorX < CENTER_L() || anchorX > CENTER_R();
  const scale     = inPreview ? v.previewScale : 1;
  const alpha     = inPreview ? 0.45 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  const popped = !!event.completed_at;

  const animStart = poppingAnimations.get(event.instanceKey);
  const elapsed   = animStart !== undefined ? performance.now() - animStart : Infinity;
  if (elapsed > POP_DONE_MS) poppingAnimations.delete(event.instanceKey);
  const animating = elapsed <= POP_DONE_MS;

  const bobOffset  = (popped || animating) ? 0 : Math.sin(bobTime + index * 0.9) * v.bobAmplitude * scale;
  const pulseSpeed = popped ? 0 : v.urgencyPulseSpeeds[event.urgency ?? 0];
  const pulseAmp   = pulseSpeed > 0 ? v.urgencyPulseAmplitude : 0;
  const pulseScale = 1 + pulseAmp * Math.sin(bobTime * pulseSpeed);
  const radius     = v.radius * scale * pulseScale;
  const balloonY   = by - floatHeight * scale + bobOffset;

  // String
  const stringEndY = (popped && !animating)
    ? balloonY - radius + radius * 1.35
    : balloonY + radius;
  ctx.strokeStyle = v.stringColor; ctx.lineWidth = v.stringWidth;
  ctx.beginPath();
  ctx.moveTo(anchorX, by);
  ctx.quadraticCurveTo(anchorX + bobOffset * 0.5, by - 90 * scale, anchorX, stringEndY);
  ctx.stroke();

  // Body
  if (animating) {
    drawPopAnimation(ctx, anchorX, balloonY, radius, event.balloonColor, elapsed);
  } else if (popped) {
    drawPoppedBalloon(ctx, anchorX, balloonY, radius, event.balloonColor);
  } else {
    ctx.beginPath(); ctx.arc(anchorX, balloonY, radius, 0, Math.PI * 2);
    ctx.fillStyle = event.balloonColor; ctx.fill();
    ctx.beginPath(); ctx.arc(anchorX - radius * 0.28, balloonY - radius * 0.28, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = v.shineColor; ctx.fill();
  }

  // Measure text while still inside save/restore so font state is cleaned up
  ctx.font = `${11 * scale}px monospace`;
  const tagPad = 6 * scale;
  const tagW   = ctx.measureText(event.label).width + tagPad * 2;
  const tagH   = t.height * scale;

  ctx.restore();

  // Return everything drawBalloonTag needs — deferred so tags paint above all bodies
  const tagX = anchorX - tagW / 2;
  const tagY = balloonY + radius + 4 * scale;
  return { event, anchorX, tagX, tagY, tagW, tagH, scale, alpha, balloonY, radius };
}

// Draws the tag label; always called after all bodies are drawn.
function drawBalloonTag({ event, anchorX, tagX, tagY, tagW, tagH, scale, alpha, balloonY, radius }) {
  const t = visualProfile.tag;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = event.tagColor;
  ctx.beginPath(); ctx.roundRect(tagX, tagY, tagW, tagH, t.radius); ctx.fill();
  ctx.fillStyle = t.textColor;
  ctx.font = `${11 * scale}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(event.label, anchorX, tagY + tagH / 2);
  ctx.restore();

  // Register bounds for click detection
  drawnTags.push({ event, x: tagX, y: tagY, w: tagW, h: tagH, cx: anchorX, cy: balloonY, r: radius });
}

// ─── Hit detection ────────────────────────────────────────────────────────────
// drawnTags: per-frame tag/balloon bounds for click detection (reset each frame)
let drawnTags = [];

// Called by ui.js — override this to handle tag clicks
window.onTagClick = () => {};

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;
  const hit  = drawnTags.find(t => {
    if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) return true;
    const ddx = mx - t.cx, ddy = my - t.cy;
    return ddx * ddx + ddy * ddy <= t.r * t.r;
  });
  if (hit) window.onTagClick(hit.event);
});

// ─── Avatar (placeholder) ────────────────────────────────────────────────────
// Stick figure in the top-right corner. Placeholder for the dart-throwing
// avatar — will become customizable and animated in a future pass.
function drawAvatar() {
  const h   = 54;                               // total figure height (px)
  const x   = canvas.width - 38;               // horizontal anchor (center of figure)
  const y   = 28;                               // top of figure
  const hr  = h * 0.13;                         // head radius
  const sw  = Math.max(1.5, h * 0.045);         // stroke width

  ctx.save();
  ctx.strokeStyle = 'rgba(180, 190, 205, 0.75)';
  ctx.fillStyle   = 'rgba(180, 190, 205, 0.75)';
  ctx.lineWidth   = sw;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  // Head
  ctx.beginPath();
  ctx.arc(x, y + hr, hr, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const neckY = y + hr * 2;
  const hipY  = y + h * 0.60;
  ctx.beginPath();
  ctx.moveTo(x, neckY);
  ctx.lineTo(x, hipY);
  ctx.stroke();

  // Arms (raised slightly — ready to throw)
  const armY = y + h * 0.35;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.30, armY + h * 0.14);
  ctx.lineTo(x,             armY);
  ctx.lineTo(x + h * 0.30, armY - h * 0.06);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - h * 0.22, y + h);
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + h * 0.22, y + h);
  ctx.stroke();

  ctx.restore();
}

// ─── Drawing: Full frame ──────────────────────────────────────────────────────
function draw(scrollOffset, bobTime) {
  drawnTags = []; // reset hit boxes each frame
  ctx.fillStyle = visualProfile.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStationBackground();          // floor + lamp glow (behind everything)
  drawBelt(scrollOffset);           // moving belt
  drawAllBalloons(scrollOffset, bobTime); // events on the belt
  drawDayLabels(scrollOffset);      // date labels move with the belt
  drawPreviewOverlays();            // dim + mesh the side zones
  drawStationFrame(scrollOffset);   // metal frame on top
  drawAvatar();                     // top-right avatar (placeholder)

  if (statusMessage) {
    ctx.save();
    ctx.fillStyle = 'rgba(200, 50, 50, 0.85)';
    ctx.fillRect(0, 0, canvas.width, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusMessage, canvas.width / 2, 16);
    ctx.restore();
  }
}
