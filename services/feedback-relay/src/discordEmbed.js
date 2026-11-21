import { MAX_ENVIRONMENT_VALUE_LENGTH } from './constants.js';
import { formatFeedbackReportReference } from '../../../shared/feedbackReference.mjs';

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

const UNKNOWN_VALUE = '未知';
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const BARE_URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_URL_PUNCTUATION = /[.,!?;:\]}]+$/u;

function truncate(value, maxLength) {
  if (typeof value !== 'string') return '';
  if (value.length <= maxLength) return value;
  let prefix = value.slice(0, maxLength - 1);
  const trailingBackslashes = prefix.match(/\\+$/u)?.[0].length ?? 0;
  if (trailingBackslashes % 2 === 1) prefix = prefix.slice(0, -1);
  return `${prefix}…`;
}

function escapeDiscordMarkdownSegment(value) {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_~|[\]()])/gu, '\\$1')
    .replace(/(^|\n)([ \t]*)([>#])/gu, '$1$2\\$3')
    .replace(/(^|\n)([ \t]*)-(?=#\s)/gu, '$1$2\\-')
    .replace(/(^|\n)([ \t]*)([-+])(?=\s)/gu, '$1$2\\$3')
    .replace(/(^|\n)([ \t]*)(\d+)\.(?=\s)/gu, '$1$2$3\\.')
    .replace(/@(everyone|here)/giu, `@${ZERO_WIDTH_SPACE}$1`)
    .replace(/<(?=[@#][!&]?\d+>)/gu, '\\<');
}

function getBareUrlTokenLength(candidate) {
  let parenthesisDepth = 0;
  let end = candidate.length;
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] === '(') {
      parenthesisDepth += 1;
    } else if (candidate[index] === ')') {
      if (parenthesisDepth === 0) {
        end = index;
        break;
      }
      parenthesisDepth -= 1;
    }
  }

  const token = candidate.slice(0, end).replace(TRAILING_URL_PUNCTUATION, '');
  return token.length;
}

// Keep pasted source URLs useful while rendering every other user-authored
// character literally. Escaping the brackets around a masked link exposes
// its actual URL instead of allowing a report to impersonate trusted copy.
function escapeDiscordMarkdown(value) {
  if (typeof value !== 'string') return '';
  let escaped = '';
  let cursor = 0;
  for (const match of value.matchAll(BARE_URL_PATTERN)) {
    const matchIndex = match.index ?? cursor;
    const tokenLength = getBareUrlTokenLength(match[0]);
    escaped += escapeDiscordMarkdownSegment(value.slice(cursor, matchIndex));
    escaped += match[0].slice(0, tokenLength);
    escaped += escapeDiscordMarkdownSegment(match[0].slice(tokenLength));
    cursor = matchIndex + match[0].length;
  }
  return escaped + escapeDiscordMarkdownSegment(value.slice(cursor));
}

function escapeAndTruncate(value, maxLength) {
  return truncate(escapeDiscordMarkdown(value), maxLength);
}

function formatEnvironmentValue(value) {
  if (typeof value !== 'string') return UNKNOWN_VALUE;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return UNKNOWN_VALUE;
  return escapeAndTruncate(normalized, MAX_ENVIRONMENT_VALUE_LENGTH);
}

function reportFooter(payload) {
  const version = formatEnvironmentValue(payload.environment?.appVersion);
  return {
    text: `Utawakui ${version} · 回報碼 ${formatFeedbackReportReference(payload.reportId)}`,
  };
}

// One embed per report, one Discord webhook body per embed — no per-kind
// structural difference beyond label/color, so a routing table in
// index.js (not this function) is what decides which channel it lands in.
export function buildDiscordWebhookBody(payload) {
  const presentation = KIND_PRESENTATION[payload.kind] ?? {
    label: payload.kind,
    color: 0x808080,
  };
  const fields = [];
  if (payload.trackLabel) {
    fields.push({
      name: '歌曲資訊',
      value: escapeAndTruncate(payload.trackLabel, 1024),
      inline: false,
    });
  }

  const diagnostics = payload.diagnostics;
  const diagnosticsAttachment =
    diagnostics?.format === 'utawakui-support-v1' && diagnostics.sealed
      ? {
          filename: `diagnostics-${payload.reportId}.utawakui-support`,
          content: JSON.stringify({
            format: diagnostics.format,
            reference: diagnostics.reference,
            eventCount: diagnostics.eventCount,
            from: diagnostics.from,
            to: diagnostics.to,
            sealed: {
              key: diagnostics.sealed.key,
              iv: diagnostics.sealed.iv,
              tag: diagnostics.sealed.tag,
              data: diagnostics.sealed.data,
            },
          }),
        }
      : null;

  if (diagnostics?.format === 'utawakui-support-v1') {
    fields.push({
      name: '診斷資料',
      value: diagnosticsAttachment
        ? `已附支援包（${diagnostics.eventCount} 筆事件）`
        : `診斷摘要（${diagnostics.eventCount} 筆事件）`,
      inline: false,
    });
  }

  if (payload.contact) {
    fields.push({
      name: '聯絡方式',
      value: escapeAndTruncate(payload.contact, 1024),
      inline: false,
    });
  }

  const embed = {
    title: truncate(presentation.label, 256),
    color: presentation.color,
    description: escapeAndTruncate(payload.description, 3500),
    fields,
    footer: reportFooter(payload),
    timestamp: payload.createdAt,
  };

  return {
    payloadJson: { allowed_mentions: { parse: [] }, embeds: [embed] },
    diagnosticsAttachment,
  };
}

const AUTO_REPORT_PRESENTATION = new Map([
  ['UNCAUGHT_EXCEPTION', ['應用程式發生異常', '應用程式']],
  ['RENDER_PROCESS_GONE', ['視窗意外關閉', '視窗']],
  ['PRELOAD_FAILED', ['視窗功能載入失敗', '視窗']],
  ['STARTUP_DEFERRED_MIGRATION_FAILED', ['啟動時未能更新本機資料', '啟動']],
  ['RENDERER_UNRESPONSIVE', ['視窗無回應', '視窗']],
  ['RENDERER_LOAD_FAILED', ['畫面載入失敗', '畫面']],
  ['VUE_UNHANDLED_ERROR', ['畫面更新異常', '畫面']],
  ['WINDOW_ERROR', ['畫面執行異常', '畫面']],
  ['OUTPUT_AUTOMATIC_START_FAILED', ['輸出未能自動啟動', '輸出']],
]);

export function buildAutoReportWebhookBody(payload) {
  const [title, feature] = AUTO_REPORT_PRESENTATION.get(payload.code) ?? [
    '應用程式發生異常',
    '應用程式',
  ];
  const critical = payload.severity === 'S1';
  return {
    payloadJson: {
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title,
          color: critical ? 0xc62828 : 0xe08a1e,
          description: critical
            ? '系統已記錄這次嚴重異常。'
            : '同一異常在一小時內反覆出現。',
          fields: [
            { name: '影響功能', value: feature, inline: true },
            {
              name: '發生次數',
              value: String(payload.occurrences),
              inline: true,
            },
          ],
          footer: reportFooter(payload),
          timestamp: payload.createdAt,
        },
      ],
    },
    diagnosticsAttachment: null,
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
