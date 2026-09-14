import { describe, expect, it } from 'vitest';
import { formatFeedbackReportReference } from './feedbackReference.mjs';

describe('formatFeedbackReportReference', () => {
  it('formats the first 48 UUID bits as a grouped uppercase reference', () => {
    expect(
      formatFeedbackReportReference('aeb6ab26-f40b-4671-a3bc-996fd802503f'),
    ).toBe('AEB6-AB26-F40B');
  });

  it('keeps short safe test identifiers readable', () => {
    expect(formatFeedbackReportReference('report-1')).toBe('REPO-RT1');
  });

  it('returns an empty reference when no alphanumeric identity exists', () => {
    expect(formatFeedbackReportReference()).toBe('');
    expect(formatFeedbackReportReference('---')).toBe('');
  });
});
