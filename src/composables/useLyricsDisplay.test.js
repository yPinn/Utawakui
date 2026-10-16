import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive, shallowRef, nextTick } from 'vue';
import { useLyricsDisplay } from './useLyricsDisplay.js';
import { mount } from '../components/ui/uiTestHost.js';

const apps = [];
afterEach(() => apps.splice(0).forEach((app) => app.unmount()));
function setup() {
  const lyrics = {
    state: reactive({ isLoadingLyrics: false }),
    selectedTrack: shallowRef({ id: 'a' }),
    selectedSource: shallowRef({ filename: 'a.lrc' }),
    lyricsDocument: shallowRef({
      documentId: 'a',
      normalizerProfileId: 'v1',
      source: { sha256: 'a'.repeat(64) },
    }),
    lyricLines: shallowRef([{ lineId: 'one', text: 'あした' }]),
  };
  const reading = {
    variant: shallowRef('off'),
    getDoc: vi.fn(() => null),
    isGenerating: vi.fn(() => false),
    errorFor: vi.fn(() => null),
    loadReading: vi.fn(async () => null),
    generateReading: vi.fn(async () => {}),
    setVariant: vi.fn((value) => {
      reading.variant.value = value;
    }),
  };
  function consumer() {
    let display;
    const { app } = mount({
      setup() {
        display = useLyricsDisplay({ lyrics, reading });
        return () => null;
      },
    });
    apps.push(app);
    return display;
  }
  return { lyrics, reading, consumer, display: consumer() };
}
describe('shared lyrics display workflow', () => {
  it('normalizes Korean selection after loading completes without erasing a transient empty preference', async () => {
    const { lyrics, reading, display } = setup();
    lyrics.state.isLoadingLyrics = true;
    reading.variant.value = 'furigana';
    lyrics.lyricLines.value = [];
    await nextTick();
    expect(reading.variant.value).toBe('furigana');
    lyrics.lyricLines.value = [{ lineId: 'ko', text: '안녕하세요' }];
    await nextTick();
    expect(reading.variant.value).toBe('furigana');
    lyrics.state.isLoadingLyrics = false;
    await nextTick();
    expect(reading.variant.value).toBe('romaji');
    await display.selectReadingVariant('furigana');
    expect(reading.variant.value).toBe('romaji');
    await display.selectReadingVariant('invalid');
    expect(reading.variant.value).toBe('off');
  });
  it('replaces stale reading data but never starts another in-flight generation', async () => {
    const { reading, display } = setup();
    reading.loadReading.mockResolvedValue({
      lines: [{ lineId: 'old', text: 'old' }],
    });
    await display.selectReadingVariant('romaji');
    expect(reading.generateReading).toHaveBeenCalledOnce();
    reading.isGenerating.mockReturnValue(true);
    await display.selectReadingVariant('romaji');
    expect(display.isGeneratingReading.value).toBe(true);
    expect(reading.generateReading).toHaveBeenCalledOnce();
  });
  it('shares explicit font tiers across consumers and clamps both ends', () => {
    const { display, consumer } = setup();
    while (display.canDecreaseLyricsFontSize.value)
      display.decreaseLyricsFontSize();
    display.decreaseLyricsFontSize();
    expect(display.lyricsFontSizeClass.value).toBe(
      'lyrics-preview--font-compact',
    );
    const other = consumer();
    display.increaseLyricsFontSize();
    expect(other.lyricsFontSizeLabel.value).toBe('標準');
    display.increaseLyricsFontSize();
    display.increaseLyricsFontSize();
    expect(other.lyricsFontSizeClass.value).toBe('lyrics-preview--font-large');
    expect(other.canIncreaseLyricsFontSize.value).toBe(false);
  });
  it('normalizes a Japanese preference on Korean lyrics and hides unsupported controls', async () => {
    const { lyrics, reading, display } = setup();
    await display.selectReadingVariant('furigana');
    lyrics.lyricLines.value = [{ lineId: 'ko', text: '안녕하세요' }];
    await nextTick();
    expect(reading.variant.value).toBe('romaji');
    expect(display.readingOptions.value.map((x) => x.id)).toEqual([
      'off',
      'romaji',
    ]);
    lyrics.lyricLines.value = [{ lineId: 'en', text: 'Hello' }];
    await nextTick();
    expect(reading.variant.value).toBe('off');
    expect(display.readingOptions.value).toEqual([]);
  });
  it('prepares when variant changes through another consumer', async () => {
    const { reading, display } = setup();
    await nextTick();
    reading.loadReading.mockClear();
    reading.variant.value = 'romaji';
    await nextTick();
    await display.refreshSelectedReading();
    expect(reading.generateReading).toHaveBeenCalledOnce();
  });
});
