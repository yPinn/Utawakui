import { describe, expect, it } from 'vitest';
import i18n from './i18n.js';
import planModule from './bgmStandbyPlan.js';

// Validation messages are looked up by code at runtime, out of the static catalog test's sight.
describe('BGM standby plan catalog coverage', () => {
  it('words every validation code', () => {
    for (const code of planModule.VALIDATION_CODES)
      expect(i18n.hasMessage(`bgm.validation.${code}`), code).toBe(true);
  });

  it('falls back to a generic message for an unknown code', () => {
    const error = new planModule.BgmStandbyPlanValidationError({
      code: 'NOT_A_CODE',
    });
    expect(error.message).toBe(i18n.t('bgm.validation.fallback'));
  });
});
