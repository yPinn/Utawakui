import { t } from './i18n.js';
const LEVELS = new Set(['error', 'warning', 'info', 'debug']);

function minuteOf(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Readable rows for the attached events, so the user can see what a report
// sends. Codes and stacks stay out of the UI; they are not user-facing.
export function summarizeFeedbackDiagnostics(diagnostics) {
  const events = Array.isArray(diagnostics?.events) ? diagnostics.events : [];
  return events.map((event, index) => ({
    key: typeof event?.id === 'string' ? event.id : `event-${index}`,
    time: minuteOf(event?.timestamp),
    level: t(
      `feedback.levels.${LEVELS.has(event?.level) ? event.level : 'error'}`,
    ),
    message: typeof event?.message === 'string' ? event.message : '',
  }));
}
