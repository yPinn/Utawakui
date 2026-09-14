import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_FEEDBACK_ENDPOINT,
  FEEDBACK_CLIENT_MARKER,
  FEEDBACK_CLIENT_MARKER_HEADER,
  resolveFeedbackEndpoint,
} = require('./constants.js');

describe('feedback transport constants', () => {
  it('uses the product-scoped production API endpoint', () => {
    expect(DEFAULT_FEEDBACK_ENDPOINT).toBe(
      'https://api.utawakui.llazypilot.com/feedback/submit',
    );
  });

  it('defines an explicitly public versioned desktop marker', () => {
    expect(FEEDBACK_CLIENT_MARKER_HEADER).toBe('X-Utawakui-Client');
    expect(FEEDBACK_CLIENT_MARKER).toBe('utawakui-desktop-feedback-v1');
  });

  it('keeps the environment override for explicit development and staging use', () => {
    expect(
      resolveFeedbackEndpoint({
        UTAWAKUI_FEEDBACK_ENDPOINT: '  https://relay.example.test/submit  ',
      }),
    ).toBe('https://relay.example.test/submit');
    expect(resolveFeedbackEndpoint({})).toBe(DEFAULT_FEEDBACK_ENDPOINT);
  });
});
