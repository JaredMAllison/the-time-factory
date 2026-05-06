// ─── App config (fetched from /api/config) ────────────────────────────────────
let appConfig = null;

// Legacy color fallback for events created before category redesign
const LEGACY_CATEGORY_COLORS = {
  'default':     '#4a90d9',
  'meeting':     '#ab47bc',
  'maintenance': '#4db6ac',
  'deadline':    '#ffb300',
  'personal':    '#81c784',
};

const DEFAULT_CATEGORIES = [
  { name: 'Self-Care',      color: '#4fc3f7' },
  { name: 'Community',      color: '#ab47bc' },
  { name: 'Productivity',   color: '#ffb300' },
  { name: 'Infrastructure', color: '#4db6ac' },
  { name: 'Personal',       color: '#81c784' },
];

function categoryColor(category) {
  if (appConfig) {
    const cat = appConfig.categories.find(c => c.name === category);
    if (cat) return cat.color;
  }
  return LEGACY_CATEGORY_COLORS[category] || '#4a90d9';
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Config API ${res.status}`);
    appConfig = await res.json();
    document.title = appConfig.displayName || 'The Time Factory';
  } catch (err) {
    console.error('loadConfig failed, using defaults:', err);
    appConfig = { displayName: 'The Time Factory', soundEnabled: false, categories: DEFAULT_CATEGORIES };
  }
  // populate the category select — must always run (fallback or real config)
  const select = document.querySelector('[name="category"]');
  select.replaceChildren(
    ...appConfig.categories.map(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      return opt;
    })
  );
}

// ─── Event data ───────────────────────────────────────────────────────────────
// Loaded from the API. Each event has: label, balloonColor, tagColor, dayOffset
let events = [];
let eventsByDay = {};     // dayOffset → event[]  (rebuilt by rebuildEventIndex)
let placementCache = {};  // dayOffset → placed event array with relative x offsets
let statusMessage = null;

// Persisted set of instanceKeys that have been popped for recurring events.
// Pops write to localStorage (key: "ttf_popped_{instanceKey}") so they survive page refreshes
// within the same occurrence window. On init, stale entries whose instance date is before today
// are pruned, so "brush teeth" reappears fresh on tomorrow's occurrence automatically.
// instanceKey format: "{uuid}_{YYYY-MM-DD}" — the last 10 chars are always the date.
let poppedInstanceKeys = new Set();
(function _initPoppedKeys() {
  // Use local date (not UTC) so pops made after UTC midnight but before local midnight
  // are not incorrectly pruned as stale. dateStr uses toISOString() which is UTC-based.
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('ttf_popped_')) continue;
    const instanceKey  = k.slice('ttf_popped_'.length);
    const instanceDate = instanceKey.slice(-10);
    if (instanceDate < today) {
      toRemove.push(k);
    } else {
      poppedInstanceKeys.add(instanceKey);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
})();
window.getPoppedInstanceKeys = () => poppedInstanceKeys;
window.addPoppedInstanceKey  = (key) => {
  poppedInstanceKeys.add(key);
  try { localStorage.setItem('ttf_popped_' + key, '1'); } catch (_) { /* storage full or private mode */ }
};

function showStatusBanner(message) {
  statusMessage = message;
}

// Build the shared display fields for a row — used by both the multi-day span path
// and the recurrence expansion path so the shape stays consistent in one place.
function baseEvent(row) {
  return {
    id:           row.id,
    label:        row.title,
    balloonColor: categoryColor(row.category),
    tagColor:     '#2a2a3a',
    date:         row.date,
    start_time:   row.start_time  || null,
    end_date:     row.end_date    || null,
    end_time:     row.end_time    || null,
    category:     row.category    || 'default',
    urgency:      row.urgency     ?? 0,
    description:  row.description || null,
    completed_at: row.completed_at || null,
    rrule:        row.rrule        || null,
  };
}

// Fetch events centred on centerDay (offset from today), ±3 days buffer.
// One-off and multi-day events are expanded into one object per day in the window.
// Recurrence seeds are expanded into one object per instance date in the window
// using rrule.js (loaded as window.rrule via vendor/rrule.min.js; RRule class at rrule.RRule).
async function loadEvents(centerDay = 0) {
  const today = new Date();
  const from  = dateStr(offsetDate(today, centerDay - 3));
  const to    = dateStr(offsetDate(today, centerDay + 3));

  try {
    const res  = await fetch(`/api/events?from=${from}&to=${to}`);
    if (!res.ok) throw new Error(`Events API ${res.status}`);
    const rows = await res.json();

    events = [];
    for (const row of rows) {
      if (row.rrule) {
        // Recurrence seed: expand instances that fall within the view window.
        // RRule.fromString expects "DTSTART:YYYYMMDD\nRRULE:FREQ=..." format.
        const dtstart = row.date.replace(/-/g, '');
        const rule = rrule.RRule.fromString(`DTSTART:${dtstart}\nRRULE:${row.rrule}`);
        // between() is inclusive on both ends when the third param is true.
        // Use UTC boundaries (Z suffix) to match rrule's UTC-based instance dates.
        const windowStart = new Date(from + 'T00:00:00Z');
        const windowEnd   = new Date(to   + 'T23:59:59Z');
        const instances   = rule.between(windowStart, windowEnd, true);
        for (const d of instances) {
          const instanceDate = dateStr(d);
          const off = dateToDayOffset(instanceDate, today);
          if (off < centerDay - 3 || off > centerDay + 3) continue;
          const instanceKey = row.id + '_' + instanceDate;
          const ev = { ...baseEvent(row), dayOffset: off, date: instanceDate, instanceKey };
          if (poppedInstanceKeys.has(instanceKey)) ev.completed_at = new Date().toISOString();
          events.push(ev);
        }
      } else {
        // One-off or multi-day event: expand across every day it spans in the window.
        const startOff = dateToDayOffset(row.date, today);
        const endOff   = row.end_date ? dateToDayOffset(row.end_date, today) : startOff;
        const first    = Math.max(centerDay - 3, Math.min(startOff, centerDay + 3));
        const last     = Math.min(centerDay + 3, Math.max(endOff,   centerDay - 3));
        for (let d = first; d <= last; d++) {
          events.push({ ...baseEvent(row), dayOffset: d, instanceKey: row.id });
        }
      }
    }
    rebuildEventIndex();
  } catch (err) {
    console.error('Failed to load events:', err);
    events = [];
    rebuildEventIndex();
    showStatusBanner('Failed to load events — check server');
  }
}

// Rebuild the dayOffset index and invalidate the placement cache.
// Must be called whenever the events array is replaced.
function rebuildEventIndex() {
  eventsByDay = {};
  placementCache = {};
  for (const e of events) {
    (eventsByDay[e.dayOffset] ??= []).push(e);
  }
}

// Return events for a given dayOffset using the pre-built index.
function eventsForDay(dayOffset) {
  return eventsByDay[dayOffset] ?? [];
}
