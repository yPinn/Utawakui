import { describe, expect, it, vi } from 'vitest';
import {
  buildDiscordWebhookBody,
  postToDiscordWebhook,
} from './discordEmbed.js';

function basePayload(overrides = {}) {
  return {
    reportId: 'report-1',
    kind: 'bug',
    createdAt: '2026-09-13T00:00:00.000Z',
    description: '整首歌卡住',
    environment: {
      appVersion: '1.0.0',
      electronVersion: '30.0.0',
      platform: 'win32',
      locale: 'zh-TW',
    },
    ...overrides,
  };
}

describe('buildDiscordWebhookBody', () => {
  it('builds a single embed with the environment fields', () => {
    const { payloadJson, diagnosticsAttachment } =
      buildDiscordWebhookBody(basePayload());
    expect(diagnosticsAttachment).toBeNull();
    expect(payloadJson.embeds).toHaveLength(1);
    const embed = payloadJson.embeds[0];
    expect(embed.title).toContain('錯誤回報');
    expect(embed.description).toBe('整首歌卡住');
    expect(embed.timestamp).toBe('2026-09-13T00:00:00.000Z');
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        { name: '回報編號', value: 'report-1', inline: true },
        { name: 'App 版本', value: '1.0.0', inline: true },
        { name: '語言', value: 'zh-TW', inline: true },
      ]),
    );
  });

  it('omits contact and trackLabel fields when absent', () => {
    const { payloadJson } = buildDiscordWebhookBody(basePayload());
    const fieldNames = payloadJson.embeds[0].fields.map((field) => field.name);
    expect(fieldNames).not.toContain('聯絡方式');
    expect(fieldNames).not.toContain('歌曲資訊');
  });

  it('includes contact and trackLabel fields when present', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({
        kind: 'content',
        contact: 'user@example.com',
        trackLabel: '歌手 - 歌名',
      }),
    );
    const fields = payloadJson.embeds[0].fields;
    expect(fields).toEqual(
      expect.arrayContaining([
        { name: '聯絡方式', value: 'user@example.com', inline: true },
        { name: '歌曲資訊', value: '歌手 - 歌名', inline: false },
      ]),
    );
  });

  it('produces a diagnostics attachment and a note field when diagnostics are present', () => {
    const diagnostics = { eventCount: 3, events: [{ level: 'error' }] };
    const { diagnosticsAttachment, payloadJson } = buildDiscordWebhookBody(
      basePayload({ diagnostics }),
    );
    expect(diagnosticsAttachment).toEqual({
      filename: 'diagnostics-report-1.json',
      content: JSON.stringify(diagnostics, null, 2),
    });
    expect(payloadJson.embeds[0].fields).toEqual(
      expect.arrayContaining([
        { name: '診斷資料', value: '已附加（3 筆事件）', inline: false },
      ]),
    );
  });

  it('truncates an overlong description defensively', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({ description: 'x'.repeat(4000) }),
    );
    expect(payloadJson.embeds[0].description).toHaveLength(3500);
    expect(payloadJson.embeds[0].description.endsWith('…')).toBe(true);
  });
});

describe('postToDiscordWebhook', () => {
  it('posts a plain JSON body when there is no diagnostics attachment', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const body = buildDiscordWebhookBody(basePayload());

    await postToDiscordWebhook(
      'https://discord.example/webhook',
      body,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.example/webhook');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(body.payloadJson);
  });

  it('posts multipart form data when a diagnostics attachment exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const body = buildDiscordWebhookBody(
      basePayload({ diagnostics: { eventCount: 1, events: [] } }),
    );

    await postToDiscordWebhook(
      'https://discord.example/webhook',
      body,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('payload_json')).toBe(
      JSON.stringify(body.payloadJson),
    );
    expect(init.body.get('files[0]')).toBeInstanceOf(Blob);
  });
});
