// Discord embed limits (title 256, description 4096, field value 1024,
// ≤25 fields, ≤6000 total characters): the app already bounds description
// to 2000 chars, so these truncations are a defensive ceiling, not the
// normal path.
const KIND_PRESENTATION = Object.freeze({
  bug: { label: '🐛 錯誤回報', color: 0xe05252 },
  feature: { label: '💡 功能請求', color: 0x5b8def },
  experience: { label: '💬 使用體驗意見', color: 0x9b6bd1 },
  content: { label: '🎵 內容／歌詞來源問題', color: 0xe0a44d },
});

function truncate(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

// One embed per report, one Discord webhook body per embed — no per-kind
// structural difference beyond label/color, so a routing table in
// index.js (not this function) is what decides which channel it lands in.
export function buildDiscordWebhookBody(payload) {
  const presentation = KIND_PRESENTATION[payload.kind] ?? {
    label: payload.kind,
    color: 0x808080,
  };
  const environment = payload.environment || {};

  const fields = [
    { name: '回報編號', value: payload.reportId, inline: true },
    { name: 'App 版本', value: environment.appVersion || '未知', inline: true },
    {
      name: 'Electron',
      value: environment.electronVersion || '未知',
      inline: true,
    },
    { name: '平台', value: environment.platform || '未知', inline: true },
    { name: '語言', value: environment.locale || '未知', inline: true },
  ];

  if (payload.contact) {
    fields.push({
      name: '聯絡方式',
      value: truncate(payload.contact, 1024),
      inline: true,
    });
  }
  if (payload.trackLabel) {
    fields.push({
      name: '歌曲資訊',
      value: truncate(payload.trackLabel, 1024),
      inline: false,
    });
  }

  const diagnosticsAttachment = payload.diagnostics
    ? {
        filename: `diagnostics-${payload.reportId}.json`,
        content: JSON.stringify(payload.diagnostics, null, 2),
      }
    : null;

  if (diagnosticsAttachment) {
    fields.push({
      name: '診斷資料',
      value: `已附加（${payload.diagnostics.eventCount ?? '?'} 筆事件）`,
      inline: false,
    });
  }

  const embed = {
    title: truncate(presentation.label, 256),
    color: presentation.color,
    description: truncate(payload.description, 3500),
    fields,
    timestamp: payload.createdAt,
  };

  return {
    payloadJson: { embeds: [embed] },
    diagnosticsAttachment,
  };
}

// Discord requires multipart/form-data (payload_json field + files[n] parts)
// only when attaching files; a plain JSON body is used otherwise, matching
// Discord's own webhook contract rather than always paying multipart's cost.
export async function postToDiscordWebhook(
  webhookUrl,
  { payloadJson, diagnosticsAttachment },
  fetchImpl,
) {
  if (!diagnosticsAttachment) {
    return fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadJson),
    });
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payloadJson));
  form.append(
    'files[0]',
    new Blob([diagnosticsAttachment.content], { type: 'application/json' }),
    diagnosticsAttachment.filename,
  );
  return fetchImpl(webhookUrl, { method: 'POST', body: form });
}
