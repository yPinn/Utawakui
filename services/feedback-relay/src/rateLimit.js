// A single get-then-put fixed-window counter is not atomic under
// concurrent requests from the same key — two requests can both read the
// same count and both proceed. That's an accepted gap for a low-traffic
// personal relay backing abuse mitigation, not a hard cap; a Durable Object
// would close it at real added deployment cost. See README.md.
const WINDOW_SECONDS = 600;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 20;

export async function isWithinRateLimit(
  kv,
  key,
  maxRequestsPerWindow = DEFAULT_MAX_REQUESTS_PER_WINDOW,
) {
  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;
  if (Number.isFinite(count) && count >= maxRequestsPerWindow) {
    return false;
  }
  await kv.put(key, String((Number.isFinite(count) ? count : 0) + 1), {
    expirationTtl: WINDOW_SECONDS,
  });
  return true;
}

export { WINDOW_SECONDS, DEFAULT_MAX_REQUESTS_PER_WINDOW };
