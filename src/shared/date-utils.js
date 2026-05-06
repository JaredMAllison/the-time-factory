'use strict';

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function offsetDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function dateToDayOffset(dateString, today) {
  const event = new Date(dateString + 'T00:00:00');
  const base  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((event - base) / 86400000);
}

module.exports = { dateStr, offsetDate, dateToDayOffset };
