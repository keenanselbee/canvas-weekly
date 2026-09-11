export function localDate(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekOf(value, timeZone) {
  const today = localDate(value, timeZone);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = shiftDate(today, -(day + 6) % 7);
  return { start, end: shiftDate(start, 6), today };
}
