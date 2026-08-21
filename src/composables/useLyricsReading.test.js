import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-scope singleton, same reasoning as useSeparation.test.js:
// resetModules + re-stubbing window before each dynamic import gives every
// test a fresh module instance instead of leaking docs/inFlight/errors.
let getLyricsReadingMock;
let generateLyricsReadingMock;
let setLyricsReadingLineMock;
let deleteLyricsReadingMock;

beforeEach(() => {
  vi.resetModules();
  getLyricsReadingMock = vi.fn();
  generateLyricsReadingMock = vi.fn();
  setLyricsReadingLineMock = vi.fn();
  deleteLyricsReadingMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      getLyricsReading: getLyricsReadingMock,
      generateLyricsReading: generateLyricsReadingMock,
      setLyricsReadingLine: setLyricsReadingLineMock,
      deleteLyricsReading: deleteLyricsReadingMock,
      onLyricsReadingProgress: () => vi.fn(),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadReading() {
  const { useLyricsReading } = await import('./useLyricsReading.js');
  return useLyricsReading();
}

const doc = {
  lines: [{ text: 'です', segments: [{ t: 'です' }], romaji: 'desu' }],
};

describe('loadReading', () => {
  it('caches a fetched doc under getDoc', async () => {
    getLyricsReadingMock.mockResolvedValue(doc);
    const reading = await loadReading();

    await reading.loadReading('t1', 'ja.vtt');

    expect(getLyricsReadingMock).toHaveBeenCalledWith('t1', 'ja.vtt');
    expect(reading.getDoc('t1', 'ja.vtt')).toEqual(doc);
  });

  it('clears any cached doc when the IPC call resolves to null', async () => {
    getLyricsReadingMock.mockResolvedValue(doc);
    const reading = await loadReading();
    await reading.loadReading('t1', 'ja.vtt');
    expect(reading.getDoc('t1', 'ja.vtt')).toEqual(doc);

    getLyricsReadingMock.mockResolvedValue(null);
    await reading.loadReading('t1', 'ja.vtt');
    expect(reading.getDoc('t1', 'ja.vtt')).toBeNull();
  });

  it('is a no-op without a trackId or sourceFilename', async () => {
    const reading = await loadReading();
    await reading.loadReading(null, 'ja.vtt');
    await reading.loadReading('t1', null);
    expect(getLyricsReadingMock).not.toHaveBeenCalled();
  });
});

describe('generateReading', () => {
  it('is a no-op while the same target is already generating', async () => {
    const reading = await loadReading();
    generateLyricsReadingMock.mockImplementation(() => new Promise(() => {}));

    reading.generateReading('t1', 'ja.vtt', ['です']);
    await Promise.resolve();
    expect(reading.isGenerating('t1', 'ja.vtt')).toBe(true);

    reading.generateReading('t1', 'ja.vtt', ['です']);
    expect(generateLyricsReadingMock).toHaveBeenCalledTimes(1);
  });

  it('stores the resulting doc and clears inFlight on success', async () => {
    generateLyricsReadingMock.mockResolvedValue(doc);
    const reading = await loadReading();

    await reading.generateReading('t1', 'ja.vtt', ['です']);

    expect(reading.isGenerating('t1', 'ja.vtt')).toBe(false);
    expect(reading.getDoc('t1', 'ja.vtt')).toEqual(doc);
    expect(reading.errorFor('t1', 'ja.vtt')).toBeNull();
  });

  it('forwards the script argument through to the IPC call unchanged', async () => {
    generateLyricsReadingMock.mockResolvedValue(doc);
    const reading = await loadReading();

    await reading.generateReading('t1', 'ko.vtt', ['한글'], 'ko');

    expect(generateLyricsReadingMock).toHaveBeenCalledWith(
      't1',
      'ko.vtt',
      ['한글'],
      'ko',
    );
  });

  it('records an error message and clears inFlight on failure', async () => {
    generateLyricsReadingMock.mockRejectedValue(new Error('boom'));
    const reading = await loadReading();

    await reading.generateReading('t1', 'ja.vtt', ['です']);

    expect(reading.isGenerating('t1', 'ja.vtt')).toBe(false);
    expect(reading.errorFor('t1', 'ja.vtt')).toBe('boom');
  });

  it('does not let one target in flight block a different target', async () => {
    const reading = await loadReading();
    generateLyricsReadingMock.mockImplementation(() => new Promise(() => {}));

    reading.generateReading('t1', 'ja.vtt', ['です']);
    await Promise.resolve();
    reading.generateReading('t2', 'ja.vtt', ['です']);
    await Promise.resolve();

    expect(generateLyricsReadingMock).toHaveBeenCalledTimes(2);
  });
});

describe('setReadingLine', () => {
  it('forwards args and stores the returned doc', async () => {
    setLyricsReadingLineMock.mockResolvedValue(doc);
    const reading = await loadReading();

    await reading.setReadingLine('t1', 'ja.vtt', 0, 'です');

    expect(setLyricsReadingLineMock).toHaveBeenCalledWith(
      't1',
      'ja.vtt',
      0,
      'です',
    );
    expect(reading.getDoc('t1', 'ja.vtt')).toEqual(doc);
  });

  it('records an error message on failure', async () => {
    setLyricsReadingLineMock.mockRejectedValue(new Error('boom'));
    const reading = await loadReading();

    await reading.setReadingLine('t1', 'ja.vtt', 0, 'です');

    expect(reading.errorFor('t1', 'ja.vtt')).toBe('boom');
  });
});

describe('deleteReading', () => {
  it('clears the cached doc on success', async () => {
    getLyricsReadingMock.mockResolvedValue(doc);
    const reading = await loadReading();
    await reading.loadReading('t1', 'ja.vtt');
    expect(reading.getDoc('t1', 'ja.vtt')).toEqual(doc);

    await reading.deleteReading('t1', 'ja.vtt');

    expect(deleteLyricsReadingMock).toHaveBeenCalledWith('t1', 'ja.vtt');
    expect(reading.getDoc('t1', 'ja.vtt')).toBeNull();
  });
});

describe('variant', () => {
  it('defaults to off and can be changed via setVariant', async () => {
    const reading = await loadReading();
    expect(reading.variant.value).toBe('off');

    reading.setVariant('furigana');
    expect(reading.variant.value).toBe('furigana');
  });
});
