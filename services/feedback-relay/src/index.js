import {
  FEEDBACK_CLIENT_MARKER_HEADER,
  FEEDBACK_SUBMIT_PATH,
  MAX_PAYLOAD_BYTES,
} from './constants.js';
import { validateFeedbackPayload } from './validate.js';
import {
  buildDiscordWebhookBody,
  postToDiscordWebhook,
} from './discordEmbed.js';
import { isWithinRateLimit } from './rateLimit.js';

// All four kinds route to the same webhook today ("single channel, reserve
// routing" per the product decision) — splitting a kind onto its own
// channel later is a one-line change here, no client or schema change.
const KIND_WEBHOOK_ENV = Object.freeze({
  bug: 'DISCORD_WEBHOOK_URL',
  feature: 'DISCORD_WEBHOOK_URL',
  experience: 'DISCORD_WEBHOOK_URL',
  content: 'DISCORD_WEBHOOK_URL',
});

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

async function readBoundedBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: 'payload-too-large' };
  }
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_PAYLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'payload-too-large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== FEEDBACK_SUBMIT_PATH) {
      return jsonResponse({ error: 'not-found' }, 404);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method-not-allowed' }, 405, {
        Allow: 'POST',
      });
    }
    const mediaType = request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== 'application/json') {
      return jsonResponse({ error: 'unsupported-media-type' }, 415);
    }

    // The marker is intentionally public and versioned. Missing mandatory
    // configuration fails closed; the marker only filters generic scanners,
    // while RATE_LIMIT_KV remains the actual abuse control.
    if (
      typeof env.CLIENT_MARKER !== 'string' ||
      env.CLIENT_MARKER.length === 0 ||
      !env.RATE_LIMIT_KV ||
      typeof env.DISCORD_WEBHOOK_URL !== 'string' ||
      env.DISCORD_WEBHOOK_URL.length === 0
    ) {
      return jsonResponse({ error: 'relay-not-configured' }, 503);
    }
    if (
      request.headers.get(FEEDBACK_CLIENT_MARKER_HEADER) !== env.CLIENT_MARKER
    ) {
      return jsonResponse({ error: 'client-not-supported' }, 403);
    }

    const boundedBody = await readBoundedBody(request);
    if (!boundedBody.ok) {
      return jsonResponse(
        { error: boundedBody.reason },
        boundedBody.reason === 'payload-too-large' ? 413 : 400,
      );
    }

    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
    let allowed;
    try {
      allowed = await isWithinRateLimit(
        env.RATE_LIMIT_KV,
        `feedback:${clientIp}`,
      );
    } catch {
      return jsonResponse({ error: 'service-unavailable' }, 503);
    }
    if (!allowed) {
      return jsonResponse({ error: 'rate-limited' }, 429);
    }

    let payload;
    try {
      payload = JSON.parse(boundedBody.text);
    } catch {
      return jsonResponse({ error: 'invalid-json' }, 400);
    }

    const validation = validateFeedbackPayload(payload);
    if (!validation.ok) {
      return jsonResponse({ error: validation.reason }, 400);
    }

    const webhookEnvKey =
      KIND_WEBHOOK_ENV[payload.kind] ?? 'DISCORD_WEBHOOK_URL';
    const webhookUrl = env[webhookEnvKey];
    if (!webhookUrl) {
      return jsonResponse({ error: 'relay-not-configured' }, 500);
    }

    const body = buildDiscordWebhookBody(payload);
    let discordResponse;
    try {
      discordResponse = await postToDiscordWebhook(webhookUrl, body, fetch);
    } catch {
      return jsonResponse({ error: 'discord-delivery-failed' }, 502);
    }
    if (!discordResponse.ok) {
      return jsonResponse({ error: 'discord-delivery-failed' }, 502);
    }

    return jsonResponse({ reportId: payload.reportId });
  },
};
