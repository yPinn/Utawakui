import { MAX_PAYLOAD_BYTES } from './constants.js';
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method-not-allowed' }, 405);
    }

    // A shared token baked into a publicly distributed desktop app cannot
    // be a real secret — this only raises the bar past drive-by scanners.
    // The actual abuse defense is the rate limiter below. See README.md.
    if (env.CLIENT_TOKEN) {
      const token = request.headers.get('X-Utawakui-Feedback-Token');
      if (token !== env.CLIENT_TOKEN) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
    }

    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ error: 'payload-too-large' }, 413);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid-json' }, 400);
    }

    const validation = validateFeedbackPayload(payload);
    if (!validation.ok) {
      return jsonResponse({ error: validation.reason }, 400);
    }

    if (env.RATE_LIMIT_KV) {
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      const allowed = await isWithinRateLimit(
        env.RATE_LIMIT_KV,
        `feedback:${clientIp}`,
      );
      if (!allowed) {
        return jsonResponse({ error: 'rate-limited' }, 429);
      }
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
