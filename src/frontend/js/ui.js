async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await res.json() : {};
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Calendar Sync ────────────────────────────────────────────────────────────
const syncBtn   = document.getElementById('sync-btn');
const syncPanel = document.getElementById('sync-panel');
const syncClose = document.getElementById('sync-close');
const syncLabel = document.getElementById('sync-label');

function formatSyncTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return 'Synced ' + d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

async function loadSyncStatus() {
  try {
    const status = await fetchJson('/api/sync/status');

    syncLabel.textContent = formatSyncTime(status.lastSyncedAt);

    const googleStatus    = document.getElementById('sync-google-status');
    const nextcloudStatus = document.getElementById('sync-nextcloud-status');
    const syncError       = document.getElementById('sync-error');
    const syncLastSynced  = document.getElementById('sync-last-synced');

    googleStatus.textContent    = status.configured.includes('google')    ? 'configured' : 'not configured';
    nextcloudStatus.textContent = status.configured.includes('nextcloud') ? 'configured' : 'not configured';
    googleStatus.className    = 'sync-source-status' + (status.configured.includes('google')    ? ' ok' : '');
    nextcloudStatus.className = 'sync-source-status' + (status.configured.includes('nextcloud') ? ' ok' : '');

    syncLastSynced.textContent = status.lastSyncedAt
      ? 'Last synced: ' + new Date(status.lastSyncedAt).toLocaleString()
      : 'Never synced';
    syncError.textContent = status.lastSyncError || '';
  } catch (err) { /* server may not be up yet */ }
}

syncBtn.addEventListener('click', async () => {
  await loadSyncStatus();
  syncPanel.classList.remove('hidden');
});
syncClose.addEventListener('click', () => syncPanel.classList.add('hidden'));
syncPanel.addEventListener('click', e => { if (e.target === syncPanel) syncPanel.classList.add('hidden'); });

document.getElementById('sync-run').addEventListener('click', async () => {
  const btn = document.getElementById('sync-run');
  btn.disabled = true;
  syncBtn.classList.add('syncing');
  document.getElementById('sync-error').textContent = '';

  try {
    await fetchJson('/api/sync', { method: 'POST' });
    await loadSyncStatus();
    await loadEvents();
  } catch (err) {
    document.getElementById('sync-error').textContent = 'Sync failed: ' + err.message;
  } finally {
    btn.disabled = false;
    syncBtn.classList.remove('syncing');
  }
});

// ── Sync config sub-panels ────────────────────────────────────────────────────
function openSyncConfig(service) {
  // Close both first, then open the requested one
  document.querySelectorAll('.sync-config-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`sync-config-${service}`).classList.remove('hidden');
}

function closeSyncConfig(service) {
  document.getElementById(`sync-config-${service}`).classList.add('hidden');
}

// Populate fields with current settings when opening
document.querySelectorAll('.sync-configure-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const service = btn.dataset.service;
    try {
      const settings = await fetchJson('/api/sync/settings');
      const form     = document.querySelector(`.sync-config-form[data-service="${service}"]`);
      if (service === 'google') {
        form.elements['icalUrl'].value = settings.google.icalUrl || '';
      } else {
        form.elements['url'].value          = settings.nextcloud.url          || '';
        form.elements['username'].value     = settings.nextcloud.username     || '';
        form.elements['calendarPath'].value = settings.nextcloud.calendarPath || '';
        form.elements['appPassword'].value  = ''; // never pre-fill passwords
      }
    } catch (err) { /* ignore — fields stay empty */ }
    openSyncConfig(service);
  });
});

document.querySelectorAll('.sync-config-close').forEach(btn => {
  btn.addEventListener('click', () => closeSyncConfig(btn.dataset.service));
});

document.querySelectorAll('.sync-config-form').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const service  = form.dataset.service;
    const settings = {};
    new FormData(form).forEach((v, k) => { if (v) settings[k] = v; });

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SAVING…';

    try {
      await fetchJson('/api/sync/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ service, settings }),
      });
      closeSyncConfig(service);
      await loadSyncStatus();
    } catch (err) {
      alert('Could not save settings: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SAVE';
    }
  });
});

// Load sync status on page load so the label is populated
loadSyncStatus();

// ─── Help overlay ─────────────────────────────────────────────────────────────
const helpBtn   = document.getElementById('help-btn');
const helpPanel = document.getElementById('help-panel');
const helpClose = document.getElementById('help-close');

helpBtn.addEventListener('click',  () => helpPanel.classList.remove('hidden'));
helpClose.addEventListener('click',() => helpPanel.classList.add('hidden'));
helpPanel.addEventListener('click', e => { if (e.target === helpPanel) helpPanel.classList.add('hidden'); });

// ─── Warp to Date ─────────────────────────────────────────────────────────────
const warpBtn   = document.getElementById('warp-btn');
const warpPanel = document.getElementById('warp-panel');
const warpClose = document.getElementById('warp-close');
const warpForm  = document.getElementById('warp-form');

warpBtn.addEventListener('click', () => {
  document.getElementById('warp-date').value = new Date().toISOString().slice(0, 10);
  warpPanel.classList.remove('hidden');
});
warpClose.addEventListener('click', () => warpPanel.classList.add('hidden'));
warpPanel.addEventListener('click', e => { if (e.target === warpPanel) warpPanel.classList.add('hidden'); });

warpForm.addEventListener('submit', e => {
  e.preventDefault();
  const val = document.getElementById('warp-date').value;
  if (!val) return;
  const [y, m, d] = val.split('-').map(Number);
  const target    = new Date(y, m - 1, d);
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const dayOffset = Math.round((target - today) / 86400000);
  warpPanel.classList.add('hidden');
  if (window.warpToDay) window.warpToDay(dayOffset);
});

// ─── Create / Edit Balloon UI ─────────────────────────────────────────────────

const createBtn   = document.getElementById('create-btn');
const createPanel = document.getElementById('create-panel');
const createClose = document.getElementById('create-close');
const createForm  = document.getElementById('create-form');
const createSubmit = document.getElementById('create-submit');

const infoPanel  = document.getElementById('info-panel');
const infoClose  = document.getElementById('info-close');
const infoEdit   = document.getElementById('info-edit');
const infoDelete = document.getElementById('info-delete');

const URGENCY_LABELS = ['Low', 'Normal', 'High', 'Critical'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetForm() {
  createForm.reset();
  createForm.event_id.value = '';
  createForm.date.value     = new Date().toISOString().slice(0, 10);
  createSubmit.textContent  = 'INFLATE BALLOON';
  document.querySelector('#create-panel-header span').textContent = 'NEW EVENT';
  setUrgency(0);
  setRecurrenceFreq('');
}

function formatTime(t) {
  if (!t) return 'All day';
  const [h, m] = t.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDate(d) {
  if (!d) return '—';
  const [y, mo, day] = d.split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Urgency picker ────────────────────────────────────────────────────────────
function setUrgency(value) {
  createForm.urgency.value = value;
  document.querySelectorAll('.urgency-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.urgency) === value);
  });
}
document.querySelectorAll('.urgency-btn').forEach(btn => {
  btn.addEventListener('click', () => setUrgency(parseInt(btn.dataset.urgency)));
});

// ── Recurrence picker ─────────────────────────────────────────────────────────
// Show/hide the BYDAY checkboxes and the "Ends" section based on selected frequency.
// setRecurrenceFreq() is also called from resetForm() to collapse everything on reset.
function setRecurrenceFreq(freq) {
  document.getElementById('recurrence-freq').value = freq;
  document.getElementById('recurrence-days').classList.toggle('hidden', freq !== 'WEEKLY');
  document.getElementById('recurrence-end').classList.toggle('hidden', !freq);
  if (!freq) {
    document.getElementById('recurrence-end-type').value = 'never';
    setRecurrenceEndType('never');
  }
}

function setRecurrenceEndType(type) {
  document.getElementById('recurrence-until').classList.toggle('hidden', type !== 'until');
  document.getElementById('recurrence-count').classList.toggle('hidden', type !== 'count');
}

document.getElementById('recurrence-freq').addEventListener('change', (e) => {
  setRecurrenceFreq(e.target.value);
});

document.getElementById('recurrence-end-type').addEventListener('change', (e) => {
  setRecurrenceEndType(e.target.value);
});

// Assemble an RFC 5545 RRULE string from the form's recurrence fields.
// Returns null when "Does not repeat" is selected.
function buildRrule(form) {
  const freq = form.recurrence_freq.value;
  if (!freq) return null;

  let rrule = `FREQ=${freq}`;

  if (freq === 'WEEKLY') {
    const days = [...form.querySelectorAll('[name="recurrence_byday"]:checked')]
      .map(cb => cb.value);
    if (days.length > 0) rrule += `;BYDAY=${days.join(',')}`;
  }

  const endType = form.recurrence_end_type.value;
  if (endType === 'until' && form.recurrence_until.value) {
    rrule += `;UNTIL=${form.recurrence_until.value.replace(/-/g, '')}`;
  } else if (endType === 'count' && form.recurrence_count.value) {
    rrule += `;COUNT=${parseInt(form.recurrence_count.value)}`;
  }

  return rrule;
}

// Populate the recurrence form fields from a stored RRULE string (used in edit mode).
function parseRruleIntoForm(form, rrule) {
  if (!rrule) { setRecurrenceFreq(''); return; }

  const freqMatch  = rrule.match(/FREQ=(\w+)/);
  const freq       = freqMatch ? freqMatch[1] : '';
  setRecurrenceFreq(freq);

  if (freq === 'WEEKLY') {
    const bdayMatch = rrule.match(/BYDAY=([\w,]+)/);
    const days      = bdayMatch ? bdayMatch[1].split(',') : [];
    form.querySelectorAll('[name="recurrence_byday"]').forEach(cb => {
      cb.checked = days.includes(cb.value);
    });
  }

  const untilMatch = rrule.match(/UNTIL=(\d{8})/);
  const countMatch = rrule.match(/COUNT=(\d+)/);
  if (untilMatch) {
    const u = untilMatch[1];
    form.recurrence_until.value    = `${u.slice(0,4)}-${u.slice(4,6)}-${u.slice(6,8)}`;
    form.recurrence_end_type.value = 'until';
    setRecurrenceEndType('until');
  } else if (countMatch) {
    form.recurrence_count.value    = countMatch[1];
    form.recurrence_end_type.value = 'count';
    setRecurrenceEndType('count');
  } else {
    form.recurrence_end_type.value = 'never';
    setRecurrenceEndType('never');
  }
}

// ── Create panel ──────────────────────────────────────────────────────────────
createBtn.addEventListener('click', () => {
  resetForm();
  createPanel.classList.remove('hidden');
});
createClose.addEventListener('click', () => createPanel.classList.add('hidden'));
createPanel.addEventListener('click', (e) => {
  if (e.target === createPanel) createPanel.classList.add('hidden');
});

// ── Info panel ────────────────────────────────────────────────────────────────
let activeEvent = null;

window.onTagClick = (event) => {
  activeEvent = event;

  document.getElementById('info-title').textContent       = event.label;
  document.getElementById('info-date').textContent        = formatDate(event.date);
  document.getElementById('info-time').textContent        = event.start_time
    ? `${formatTime(event.start_time)}${event.end_time ? ' – ' + formatTime(event.end_time) : ''}`
    : 'All day';
  document.getElementById('info-category').textContent   = event.category || 'General';
  document.getElementById('info-urgency').textContent    = URGENCY_LABELS[event.urgency ?? 0];

  const descRow = document.getElementById('info-desc-row');
  const desc    = event.description || '';
  if (desc) {
    document.getElementById('info-description').textContent = desc;
    descRow.style.display = 'flex';
  } else {
    descRow.style.display = 'none';
  }

  const popBtn = document.getElementById('info-pop');
  popBtn.textContent = event.completed_at ? 'RESTORE' : 'POP IT';
  popBtn.classList.toggle('completed', !!event.completed_at);

  infoPanel.classList.remove('hidden');
};

infoClose.addEventListener('click', () => infoPanel.classList.add('hidden'));
infoPanel.addEventListener('click', (e) => {
  if (e.target === infoPanel) infoPanel.classList.add('hidden');
});

// ── Edit ──────────────────────────────────────────────────────────────────────
infoEdit.addEventListener('click', () => {
  if (!activeEvent) return;
  const ev = activeEvent;

  // Extract zettel link from description if present
  const zettelMatch = (ev.description || '').match(/^\[\[(.+?)\]\]\s*/);
  const zettelLink  = zettelMatch ? zettelMatch[1] : '';
  const description = zettelMatch ? ev.description.slice(zettelMatch[0].length) : (ev.description || '');

  createForm.event_id.value    = ev.id;
  createForm.title.value       = ev.label;
  createForm.date.value        = ev.date        || '';
  createForm.start_time.value  = ev.start_time  || '';
  createForm.end_date.value    = ev.end_date     || '';
  createForm.end_time.value    = ev.end_time     || '';
  createForm.category.value    = ev.category     || 'Self-Care';
  createForm.zettel_link.value = zettelLink;
  createForm.description.value = description;
  createSubmit.textContent     = 'UPDATE BALLOON';
  setUrgency(ev.urgency ?? 0);
  parseRruleIntoForm(createForm, ev.rrule || null);

  document.querySelector('#create-panel-header span').textContent = 'EDIT EVENT';
  infoPanel.classList.add('hidden');
  createPanel.classList.remove('hidden');
});

// ── Pop / Restore ─────────────────────────────────────────────────────────────
document.getElementById('info-pop').addEventListener('click', async () => {
  if (!activeEvent) return;

  if (activeEvent.rrule) {
    // Recurring instance: pop is session-local only — no DB write.
    // Writing completed_at to the seed would mark the entire series done forever.
    // The instance disappears for this session and reappears fresh on next page load.
    if (!activeEvent.completed_at) {
      window.addPoppedInstanceKey(activeEvent.instanceKey);
      window.startPopAnimation(activeEvent.instanceKey);
    }
    infoPanel.classList.add('hidden');
    activeEvent = null;
    // Delay reload until the pop animation completes — reloadEvents() filters
    // the instance out via poppedInstanceKeys, which would remove it from the
    // events array before the animation finishes rendering.
    setTimeout(() => window.reloadEvents(), (window.POP_DONE_MS || 650) + 50);
    return;
  }

  const patch = {
    ...activeEvent,
    title:        activeEvent.label,
    completed_at: activeEvent.completed_at ? null : new Date().toISOString(),
  };
  try {
    await fetchJson(`/api/events/${activeEvent.id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    if (!activeEvent.completed_at) window.startPopAnimation(activeEvent.instanceKey);
    infoPanel.classList.add('hidden');
    activeEvent = null;
    await window.reloadEvents();
  } catch (err) {
    console.error('Failed to update event:', err);
    alert('Something went wrong. Check the console.');
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────
const seriesDeletePanel = document.getElementById('series-delete-panel');

infoDelete.addEventListener('click', () => {
  if (!activeEvent) return;
  if (activeEvent.rrule) {
    // Recurring event — show the series delete dialog instead of a plain confirm
    document.getElementById('series-delete-label').textContent = `"${activeEvent.label}"`;
    infoPanel.classList.add('hidden');
    seriesDeletePanel.classList.remove('hidden');
  } else {
    if (!confirm(`Delete "${activeEvent.label}"?`)) return;
    deleteSingleEvent(activeEvent.id);
  }
});

async function deleteSingleEvent(id) {
  try {
    await fetchJson(`/api/events/${id}`, { method: 'DELETE' });
    infoPanel.classList.add('hidden');
    activeEvent = null;
    await window.reloadEvents();
  } catch (err) {
    console.error('Failed to delete event:', err);
    alert('Something went wrong. Check the console.');
  }
}

document.getElementById('series-delete-cancel').addEventListener('click', () => {
  seriesDeletePanel.classList.add('hidden');
  infoPanel.classList.remove('hidden');
});

document.getElementById('series-delete-all').addEventListener('click', async () => {
  if (!activeEvent) return;
  seriesDeletePanel.classList.add('hidden');
  try {
    await fetchJson(`/api/events/${activeEvent.id}?mode=all`, { method: 'DELETE' });
    activeEvent = null;
    await window.reloadEvents();
  } catch (err) {
    console.error('Failed to delete series:', err);
    alert('Something went wrong. Check the console.');
  }
});

document.getElementById('series-delete-previous').addEventListener('click', async () => {
  if (!activeEvent) return;
  // "Remove previous" cuts the series off before the currently displayed instance date
  const before = activeEvent.date;
  seriesDeletePanel.classList.add('hidden');
  try {
    await fetchJson(`/api/events/${activeEvent.id}?mode=previous&before=${before}`, { method: 'DELETE' });
    activeEvent = null;
    await window.reloadEvents();
  } catch (err) {
    console.error('Failed to trim series:', err);
    alert('Something went wrong. Check the console.');
  }
});

// ── Form submission (create or edit) ─────────────────────────────────────────
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const zettelLink  = createForm.zettel_link.value.trim();
  const description = createForm.description.value.trim();
  const fullDescription = zettelLink
    ? `[[${zettelLink}]]${description ? ' ' + description : ''}`
    : description || null;

  const data = {
    title:       createForm.title.value.trim(),
    date:        createForm.date.value,
    start_time:  createForm.start_time.value || null,
    end_date:    createForm.end_date.value   || null,
    end_time:    createForm.end_time.value   || null,
    category:    createForm.category.value,
    urgency:     parseInt(createForm.urgency.value),
    description: fullDescription,
    rrule:       buildRrule(createForm),
  };

  const eventId  = createForm.event_id.value;
  const isEdit   = !!eventId;
  const url      = isEdit ? `/api/events/${eventId}` : '/api/events';
  const method   = isEdit ? 'PUT' : 'POST';

  try {
    await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    createPanel.classList.add('hidden');
    await window.reloadEvents();
  } catch (err) {
    console.error('Failed to save event:', err);
    alert('Something went wrong. Check the console.');
  }
});

// ── Close all panels on Escape ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    createPanel.classList.add('hidden');
    infoPanel.classList.add('hidden');
    warpPanel.classList.add('hidden');
    helpPanel.classList.add('hidden');
    syncPanel.classList.add('hidden');
    seriesDeletePanel.classList.add('hidden');
  }
});
