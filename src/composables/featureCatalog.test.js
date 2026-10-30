import { describe, expect, it } from 'vitest';
import { FEATURE_GATES } from '../constants/featureGates.js';
import { catalogKey, t } from '../utils/i18n.js';

// These keys are built from ids and codes at runtime, out of the static catalog test's sight.
const resolved = (key) => {
  const text = t(key);
  return typeof text === 'string' && text !== key;
};

describe('feature and dependency catalog coverage', () => {
  it('names and describes every feature gate', () => {
    for (const gate of Object.values(FEATURE_GATES))
      for (const field of ['title', 'description'])
        expect(
          resolved(`featureGates.gates.${catalogKey(gate.id)}.${field}`),
          gate.id,
        ).toBe(true);
  });

  it('labels every dependency status code', () => {
    for (const code of [
      'updateAvailable',
      'available',
      'usingSystem',
      'prepared',
      'preparing',
      'systemAvailable',
      'needsMigration',
      'missing',
      'unreadable',
    ])
      expect(resolved(`dependencies.status.${code}`), code).toBe(true);
  });

  it('words every dependency operation outcome', () => {
    for (const operation of ['prepare', 'repair', 'remove'])
      for (const outcome of ['running', 'failed', 'done'])
        expect(
          resolved(`dependencies.notify.${operation}.${outcome}`),
          `${operation}.${outcome}`,
        ).toBe(true);
  });
});
