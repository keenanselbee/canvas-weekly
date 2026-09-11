const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const unavailable = 'Canvas did not confirm the account identity. Reconnect Canvas before continuing.';

// Canvas emits global IDs here; profile/GraphQL legacy IDs can be shard-local.
// Capture this ID from the verified self-profile response instead of deriving it.
export function canvasResponseIdentity(headers, expectedGlobalUserId) {
  let userId, realUserId;
  try {
    userId = headers.get('x-canvas-user-id');
    realUserId = headers.get('x-canvas-real-user-id');
  } catch { throw new Error(unavailable); }
  if (!validId(userId) || (expectedGlobalUserId !== undefined && (!validId(expectedGlobalUserId) || userId !== expectedGlobalUserId))
    || (realUserId !== null && (!validId(realUserId) || realUserId !== userId))) throw new Error(unavailable);
  return Object.freeze({ globalUserId: userId });
}
