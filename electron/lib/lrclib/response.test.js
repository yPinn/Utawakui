import { describe, expect, it } from 'vitest';
import { readJsonResponse } from './response.js';

describe('readJsonResponse', () => {
  it('reads valid JSON for the existing Musixmatch compatibility path', async () => {
    await expect(
      readJsonResponse(new Response(JSON.stringify({ ok: true }))),
    ).resolves.toEqual({ ok: true });
  });

  it('returns null for invalid JSON without exposing parser failures', async () => {
    await expect(readJsonResponse(new Response('{broken'))).resolves.toBeNull();
  });
});
