// Version the consent when the permitted effects change. No setting grants
// arbitrary requests or assessment actions. New sources need separate admission.
export const READING_VERSION = 1;
export const EXPANDED_AVAILABLE = false;
export const EXPANDED_NOTICE = 'Expanded reading may record views, satisfy view-based module requirements, or make subsequent material available. It never permits starting or resuming attempts, submitting work, sending messages, or explicit Mark done actions.';
export const EXPANDED_HOLD = 'Additional material reads are pending safety validation. Only limited reading runs for now; assignment instructions, pages and files are not automatically opened.';

export function readingSelection(settings, origin, userId, courseIds) {
  const consent = (settings.courseReading || []).find(entry => entry.origin === origin && entry.userId === userId && entry.version === READING_VERSION);
  return courseIds.map(courseId => ({ courseId, requested: consent?.courseIds.includes(courseId) ? 'expanded' : 'limited',
    effective: EXPANDED_AVAILABLE && consent?.courseIds.includes(courseId) ? 'expanded' : 'limited' }));
}

export function validateReadingPreferences(value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid course reading preferences.');
  const seen = new Set();
  for (const entry of value) {
    let origin;
    try { origin = new URL(entry.origin); } catch { throw new Error('Invalid course reading account.'); }
    const key = `${entry.origin}:${entry.userId}`;
    if (origin.protocol !== 'https:' || origin.origin !== entry.origin || !/^[1-9]\d{0,31}$/.test(entry.userId)
      || typeof entry.userId !== 'string' || entry.version !== READING_VERSION || seen.has(key)
      || !Array.isArray(entry.courseIds) || entry.courseIds.length > 500
      || entry.courseIds.some(id => typeof id !== 'string' || !/^[1-9]\d{0,31}$/.test(id))
      || new Set(entry.courseIds).size !== entry.courseIds.length) throw new Error('Invalid course reading preferences.');
    seen.add(key);
  }
}
