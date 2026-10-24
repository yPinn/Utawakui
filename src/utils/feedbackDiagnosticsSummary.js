const LEVEL_LABELS = Object.freeze({
  error: '錯誤',
  warning: '警告',
  info: '資訊',
  debug: '偵錯',
});

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
    level: LEVEL_LABELS[event?.level] ?? LEVEL_LABELS.error,
    message: typeof event?.message === 'string' ? event.message : '',
  }));
}
