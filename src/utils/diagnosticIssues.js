// Groups diagnostic events into issues for the dev-only F6 triage page.

const LEVEL_RANK = Object.freeze({ error: 3, warning: 2, info: 1, debug: 0 });

// Environment keys repeat on every event; they are summarized separately.
const ENVIRONMENT_KEYS = new Set([
  'appVersion',
  'electronVersion',
  'processType',
  'windowRole',
]);

export const TRIAGE_STATUSES = Object.freeze(['open', 'confirmed', 'ignored']);

export function issueFingerprint(event) {
  return [event.process, event.source, event.operation, event.code]
    .map((part) => part ?? '')
    .join('|');
}

function timeOf(event) {
  const time = Date.parse(event.timestamp);
  return Number.isFinite(time) ? time : 0;
}

function countValue(counts, value) {
  const key = String(value);
  counts[key] = (counts[key] ?? 0) + 1;
}

export function groupDiagnosticIssues(events) {
  const groups = new Map();
  for (const event of events) {
    const fingerprint = issueFingerprint(event);
    let issue = groups.get(fingerprint);
    if (!issue) {
      issue = {
        fingerprint,
        level: event.level,
        process: event.process,
        source: event.source,
        operation: event.operation,
        code: event.code,
        events: [],
        sessions: new Set(),
        versions: {},
        context: {},
      };
      groups.set(fingerprint, issue);
    }
    issue.events.push(event);
    if ((LEVEL_RANK[event.level] ?? 0) > (LEVEL_RANK[issue.level] ?? 0)) {
      issue.level = event.level;
    }
    if (event.sessionId) issue.sessions.add(event.sessionId);
    const context = event.context ?? {};
    if (context.appVersion) countValue(issue.versions, context.appVersion);
    for (const [key, value] of Object.entries(context)) {
      if (ENVIRONMENT_KEYS.has(key) || value === null || value === undefined) {
        continue;
      }
      issue.context[key] ??= {};
      countValue(issue.context[key], value);
    }
  }

  return [...groups.values()]
    .map((issue) => {
      const ordered = issue.events.toSorted((a, b) => timeOf(b) - timeOf(a));
      return {
        fingerprint: issue.fingerprint,
        level: issue.level,
        process: issue.process,
        source: issue.source,
        operation: issue.operation,
        code: issue.code,
        count: ordered.length,
        sessionCount: issue.sessions.size,
        latest: ordered[0],
        firstSeen: ordered.at(-1).timestamp,
        lastSeen: ordered[0].timestamp,
        messages: [...new Set(ordered.map((event) => event.message))],
        stack: ordered.find((event) => event.stack)?.stack ?? '',
        versions: issue.versions,
        context: issue.context,
        events: ordered,
      };
    })
    .toSorted(
      (a, b) =>
        (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0) ||
        timeOf(b.latest) - timeOf(a.latest),
    );
}

// Events from the same app session that happened just before `event`.
export function sessionTrail(events, event, limit = 8) {
  if (!event?.sessionId) return [];
  const until = timeOf(event);
  return events
    .filter(
      (candidate) =>
        candidate.sessionId === event.sessionId &&
        candidate.id !== event.id &&
        timeOf(candidate) <= until,
    )
    .toSorted((a, b) => timeOf(a) - timeOf(b))
    .slice(-limit);
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return '剛剛';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

// Accepts the Settings export bundle or a bare event array.
export function parseDiagnosticsBundle(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const events = Array.isArray(parsed) ? parsed : parsed?.events;
  if (!Array.isArray(events)) return null;
  return events.filter(
    (event) =>
      event &&
      typeof event === 'object' &&
      typeof event.level === 'string' &&
      typeof event.message === 'string',
  );
}

function topValues(counts, limit = 3) {
  return Object.entries(counts)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value}×${count}`)
    .join('、');
}

export function issueToMarkdown(issue) {
  const versions = topValues(issue.versions);
  const context = Object.entries(issue.context)
    .map(([key, counts]) => `${key}: ${topValues(counts)}`)
    .join('；');
  const lines = [
    `- [ ] [${issue.level}] ${issue.code} — ${issue.messages[0]}`,
    `  - ${issue.source}/${issue.operation}（${issue.process}）· ${issue.count} 次 · ${issue.sessionCount} 次啟動 · ${issue.firstSeen} → ${issue.lastSeen}`,
  ];
  if (versions) lines.push(`  - 版本：${versions}`);
  if (context) lines.push(`  - 附帶資訊：${context}`);
  return lines.join('\n');
}

export function issuesToMarkdown(issues) {
  return issues.map(issueToMarkdown).join('\n');
}
