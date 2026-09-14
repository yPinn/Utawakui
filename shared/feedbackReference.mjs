const REPORT_REFERENCE_CHARACTER_COUNT = 12;
const REPORT_REFERENCE_GROUP_SIZE = 4;

// The canonical report id remains the complete UUID. This formatter exposes
// only a stable, searchable 48-bit prefix for human conversation and triage.
export function formatFeedbackReportReference(reportId) {
  if (typeof reportId !== 'string') return '';
  const characters = reportId
    .replace(/[^A-Za-z0-9]/gu, '')
    .slice(0, REPORT_REFERENCE_CHARACTER_COUNT)
    .toUpperCase();
  if (!characters) return '';

  const groups = [];
  for (
    let index = 0;
    index < characters.length;
    index += REPORT_REFERENCE_GROUP_SIZE
  ) {
    groups.push(characters.slice(index, index + REPORT_REFERENCE_GROUP_SIZE));
  }
  return groups.join('-');
}
