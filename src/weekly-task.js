// Distinguish preparation actions from the evidence they share. Normalization
// also prevents capitalization or spacing from disguising duplicate actions.
export function weeklyTaskKey(task) {
  const action = String(task.action ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return JSON.stringify([task.sourceId, action]);
}
