import { describe, expect, it } from 'vitest';
import packageMetadata from '../../package.json';
import { PROJECT_URL, appUserAgent } from './userAgent.js';

describe('appUserAgent', () => {
  it('returns the bare product token without a comment', () => {
    expect(appUserAgent()).toBe(`Utawakui/${packageMetadata.version}`);
  });

  it('appends the caller comment in parentheses', () => {
    expect(appUserAgent('feedback')).toBe(
      `Utawakui/${packageMetadata.version} (feedback)`,
    );
    expect(appUserAgent(PROJECT_URL)).toBe(
      `Utawakui/${packageMetadata.version} (https://github.com/yPinn/Utawakui)`,
    );
  });
});
