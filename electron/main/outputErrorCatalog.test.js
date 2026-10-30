import { describe, expect, it } from 'vitest';
import i18n from '../lib/i18n.js';
import obsAdapterModule from './obsAdapter.js';
import spoutOutputRuntimeModule from './spoutOutputRuntime.js';

// Public error messages are looked up by code at runtime, out of the static catalog test's sight.
describe('OBS and Spout2 error catalog coverage', () => {
  it('words every public OBS error code', () => {
    for (const code of obsAdapterModule.PUBLIC_ERROR_CODES)
      expect(i18n.hasMessage(`obs.errors.${code}`), code).toBe(true);
  });

  it('words every public Spout2 error code', () => {
    for (const code of spoutOutputRuntimeModule.PUBLIC_ERROR_CODES)
      expect(i18n.hasMessage(`output.spout.errors.${code}`), code).toBe(true);
  });

  it('labels every OBS lifecycle', () => {
    for (const lifecycle of [
      'disabled',
      'disconnected',
      'connecting',
      'authenticating',
      'ready',
      'degraded',
      'error',
    ])
      expect(i18n.hasMessage(`obs.lifecycle.${lifecycle}`), lifecycle).toBe(
        true,
      );
  });
});
