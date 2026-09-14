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
  it('keeps the report content primary and moves tracking metadata to the footer', () => {
    const { payloadJson, diagnosticsAttachment } =
      buildDiscordWebhookBody(basePayload());
    expect(diagnosticsAttachment).toBeNull();
    expect(payloadJson.allowed_mentions).toEqual({ parse: [] });
    expect(payloadJson.embeds).toHaveLength(1);
    const embed = payloadJson.embeds[0];
    expect(embed.title).toContain('錯誤回報');
    expect(embed.description).toBe('整首歌卡住');
    expect(embed.timestamp).toBe('2026-09-13T00:00:00.000Z');
    expect(embed.footer).toEqual({ text: '回報碼 · REPO-RT1' });
    expect(embed.fields).toEqual([
      {
        name: '版本',
        value: 'Utawakui 1.0.0\nElectron 30.0.0',
        inline: true,
      },
      { name: '環境', value: 'Windows\nzh-TW', inline: true },
    ]);
  });

  it.each([
    ['bug', '🐛 錯誤回報', 0xe05252],
    ['feature', '💡 功能請求', 0x5b8def],
    ['experience', '💬 使用體驗意見', 0x9b6bd1],
    ['content', '🎵 內容／歌詞來源問題', 0xe0a44d],
  ])(
    'keeps %s identifiable by text and supporting color',
    (kind, title, color) => {
      const { payloadJson } = buildDiscordWebhookBody(basePayload({ kind }));
      expect(payloadJson.embeds[0]).toMatchObject({ title, color });
    },
  );

  it('omits absent optional content without changing the metadata pair', () => {
    const { payloadJson } = buildDiscordWebhookBody(basePayload());
    expect(payloadJson.embeds[0].fields.map((field) => field.name)).toEqual([
      '版本',
      '環境',
    ]);
  });

  it('keeps variable content full-width before the compact metadata pair', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({
        kind: 'content',
        contact: 'user@example.com',
        trackLabel: '歌手 - 歌名',
      }),
    );
    expect(payloadJson.embeds[0].fields).toEqual([
      { name: '歌曲資訊', value: '歌手 - 歌名', inline: false },
      { name: '聯絡方式', value: 'user@example.com', inline: false },
      {
        name: '版本',
        value: 'Utawakui 1.0.0\nElectron 30.0.0',
        inline: true,
      },
      { name: '環境', value: 'Windows\nzh-TW', inline: true },
    ]);
  });

  it('orders a diagnostics note before contact and keeps both full-width', () => {
    const diagnostics = { eventCount: 3, events: [{ level: 'error' }] };
    const { diagnosticsAttachment, payloadJson } = buildDiscordWebhookBody(
      basePayload({ diagnostics, contact: 'tester@example.com' }),
    );
    expect(diagnosticsAttachment).toEqual({
      filename: 'diagnostics-report-1.json',
      content: JSON.stringify(diagnostics, null, 2),
    });
    expect(payloadJson.embeds[0].fields.slice(0, 2)).toEqual([
      { name: '診斷資料', value: '已附加（3 筆事件）', inline: false },
      { name: '聯絡方式', value: 'tester@example.com', inline: false },
    ]);
  });

  it('shows a compact reference while retaining the full id in the attachment name', () => {
    const reportId = 'aeb6ab26-f40b-4671-a3bc-996fd802503f';
    const { diagnosticsAttachment, payloadJson } = buildDiscordWebhookBody(
      basePayload({
        reportId,
        diagnostics: { eventCount: 1, events: [{}] },
      }),
    );

    expect(payloadJson.embeds[0].footer).toEqual({
      text: '回報碼 · AEB6-AB26-F40B',
    });
    expect(diagnosticsAttachment.filename).toBe(`diagnostics-${reportId}.json`);
  });

  it.each([
    ['darwin', 'macOS'],
    ['linux', 'Linux'],
    ['freebsd', 'freebsd'],
  ])('formats the %s platform label as %s', (platform, label) => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({ environment: { platform } }),
    );
    expect(payloadJson.embeds[0].fields).toEqual([
      {
        name: '版本',
        value: 'Utawakui 未知\nElectron 未知',
        inline: true,
      },
      { name: '環境', value: `${label}\n未知`, inline: true },
    ]);
  });

  it('uses bounded fallbacks when environment metadata is absent', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({ environment: undefined }),
    );
    expect(payloadJson.embeds[0].fields).toEqual([
      {
        name: '版本',
        value: 'Utawakui 未知\nElectron 未知',
        inline: true,
      },
      { name: '環境', value: '未知\n未知', inline: true },
    ]);
  });

  it('truncates an overlong description defensively', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({ description: 'x'.repeat(4000) }),
    );
    expect(payloadJson.embeds[0].description).toHaveLength(3500);
    expect(payloadJson.embeds[0].description.endsWith('…')).toBe(true);
  });

  it('renders user text literally without allowing Discord Markdown spoofing', () => {
    const bareUrl = 'https://example.com/source_path?q=a_b#section';
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({
        kind: 'content',
        description: [
          '# trusted heading',
          '1. forged ordered item',
          '-# forged subtext',
          '||hidden|| and `code`',
          '@everyone <@123456789>',
          '[official status](https://evil.example/phish)',
          bareUrl,
          'https://en.wikipedia.org/wiki/Foo_(bar)',
        ].join('\n'),
        trackLabel: '*artist* - _title_',
        contact: '[maintainer](https://evil.example/contact)',
      }),
    );
    const embed = payloadJson.embeds[0];

    expect(embed.description).toBe(
      [
        '\\# trusted heading',
        '1\\. forged ordered item',
        '\\-# forged subtext',
        '\\|\\|hidden\\|\\| and \\`code\\`',
        '@\u200beveryone \\<@123456789>',
        '\\[official status\\]\\(https://evil.example/phish\\)',
        bareUrl,
        'https://en.wikipedia.org/wiki/Foo_(bar)',
      ].join('\n'),
    );
    expect(embed.fields[0]).toEqual({
      name: '歌曲資訊',
      value: '\\*artist\\* - \\_title\\_',
      inline: false,
    });
    expect(embed.fields[1]).toEqual({
      name: '聯絡方式',
      value: '\\[maintainer\\]\\(https://evil.example/contact\\)',
      inline: false,
    });
  });

  it('escapes environment metadata without breaking the compact pair', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({
        environment: {
          appVersion: '*1.0.0*\nforged',
          electronVersion: '`30.0.0`\r\nforged',
          platform: '# forged\nplatform',
          locale: '||hidden||\tlocale',
        },
      }),
    );

    expect(payloadJson.embeds[0].fields).toEqual([
      {
        name: '版本',
        value: 'Utawakui \\*1.0.0\\* forged\nElectron \\`30.0.0\\` forged',
        inline: true,
      },
      {
        name: '環境',
        value: '\\# forged platform\n\\|\\|hidden\\|\\| locale',
        inline: true,
      },
    ]);
  });

  it('stays within Discord embed limits at the relay content bounds', () => {
    const { payloadJson } = buildDiscordWebhookBody(
      basePayload({
        reportId: 'r'.repeat(200),
        kind: 'content',
        description: '*'.repeat(2000),
        contact: '|'.repeat(200),
        trackLabel: '_'.repeat(200),
        environment: {
          appVersion: '`'.repeat(100),
          electronVersion: '~'.repeat(100),
          platform: '#'.repeat(100),
          locale: '*'.repeat(100),
        },
      }),
    );
    const embed = payloadJson.embeds[0];
    const countedText = [
      embed.title,
      embed.description,
      embed.footer.text,
      ...embed.fields.flatMap((field) => [field.name, field.value]),
    ].join('');

    expect(embed.fields).toHaveLength(4);
    expect(embed.fields.every((field) => field.name.length <= 256)).toBe(true);
    expect(embed.fields.every((field) => field.value.length <= 1024)).toBe(
      true,
    );
    expect(embed.footer.text.length).toBeLessThanOrEqual(2048);
    expect(countedText.length).toBeLessThanOrEqual(6000);
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
