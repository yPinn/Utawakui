import { describe, expect, it } from 'vitest';
import i18n from './i18n.js';
import planModule from './performanceSessionPlan.js';

// Validation messages are looked up by code at runtime, out of the static catalog test's sight.
describe('performance session catalog coverage', () => {
  it('words every session plan validation code', () => {
    for (const code of planModule.VALIDATION_CODES)
      expect(i18n.hasMessage(`session.validation.${code}`), code).toBe(true);
  });

  it('falls back to a generic message for an unknown code', () => {
    const error = new planModule.PerformanceSessionPlanValidationError({
      code: 'NOT_A_CODE',
    });
    expect(error.message).toBe(i18n.t('session.validation.fallback'));
  });
});
