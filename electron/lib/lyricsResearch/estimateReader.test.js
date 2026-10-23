import { describe, expect, it, vi } from 'vitest';
import { createExperimentalEstimateReader } from './estimateReader.js';
function setup() {
  let library = 'library',
    enabled = true;
  const input = { sourceRevision: 'v3-source' };
  const loadInput = vi.fn(async () => input);
  const loadEstimate = vi.fn(() => ({
    status: 'ready',
    compatibility: { rule: 'normalizer-v2-v3-exact-v1' },
  }));
  const inputCurrent = vi.fn(() => true);
  const read = createExperimentalEstimateReader({
    getLibraryDir: () => library,
    isEnabled: () => enabled,
    loadInput,
    loadEstimate,
    inputCurrent,
  });
  return {
    read,
    input,
    loadInput,
    loadEstimate,
    inputCurrent,
    library: (value) => {
      library = value;
    },
    enabled: (value) => {
      enabled = value;
    },
  };
}
describe('experimental estimate read publication', () => {
  it('returns a ready estimate for only the captured current source revision', async () => {
    const s = setup();
    expect(await s.read('song', 'main.vtt')).toMatchObject({
      status: 'ready',
      sourceRevision: 'v3-source',
    });
    expect(s.loadInput).toHaveBeenCalledWith(
      'library',
      { trackId: 'song', language: 'zh', lineIndex: 0 },
      { filename: 'main.vtt' },
    );
    expect(s.inputCurrent).toHaveBeenCalledTimes(2);
  });
  it.each(['source', 'library', 'gate'])(
    'rejects %s changes while input is being loaded',
    async (kind) => {
      const s = setup();
      let release;
      s.loadInput.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const pending = s.read('song', 'main.vtt');
      if (kind === 'source') s.inputCurrent.mockReturnValue(false);
      if (kind === 'library') s.library('other');
      if (kind === 'gate') s.enabled(false);
      release(s.input);
      expect((await pending).status).toBe(
        kind === 'gate' ? 'disabled' : 'stale',
      );
      expect(s.loadEstimate).not.toHaveBeenCalled();
    },
  );
  it('does not publish source changes during synchronous preparation, even on a memory hit', async () => {
    const s = setup();
    s.inputCurrent.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(await s.read('song', 'main.vtt')).toMatchObject({
      status: 'stale',
      reason: 'source-changed',
    });
    expect(s.loadEstimate).toHaveBeenCalledTimes(1);
  });
  it('never loads data behind a disabled gate', async () => {
    const s = setup();
    s.enabled(false);
    expect(await s.read('song', 'main.vtt')).toEqual({ status: 'disabled' });
    expect(s.loadInput).not.toHaveBeenCalled();
  });
  it.each(['gate', 'library'])(
    'rechecks %s after preparing a result',
    async (kind) => {
      const s = setup();
      s.loadEstimate.mockImplementationOnce(() => {
        if (kind === 'gate') s.enabled(false);
        else s.library('other');
        return { status: 'ready' };
      });
      expect((await s.read('song', 'main.vtt')).status).toBe(
        kind === 'gate' ? 'disabled' : 'stale',
      );
    },
  );
});
