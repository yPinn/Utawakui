import { describe, expect, it } from 'vitest';
import {
  alignReadings,
  detectLyricsScript,
  formatLyricsSourceLabel,
  formatLyricsSourceOffset,
  formatLyricsSourceTier,
  formatLyricTime,
  inferPreferredLyricsLanguagePrefixes,
  isNonLyricCue,
  parseEnhancedLrc,
  parseLrc,
  parseLyricsText,
  parseVtt,
  pickPreferredLyricsSource,
  preprocessLyricCueText,
} from './lyrics.js';

describe('parseVtt', () => {
  it('parses timed lyric lines', () => {
    expect(
      parseVtt(`WEBVTT

00:00:01.000 --> 00:00:03.500
Hello &amp; goodbye

00:00:04.000 --> 00:00:05.000
Second line`),
    ).toEqual([
      { start: 1, end: 3.5, text: 'Hello & goodbye' },
      { start: 4, end: 5, text: 'Second line' },
    ]);
  });

  it('filters non-lyric music cues from YouTube captions', () => {
    expect(
      parseVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
[Music]

00:00:03.000 --> 00:00:04.000
(instrumental)

00:00:05.000 --> 00:00:06.000
Real lyric`),
    ).toEqual([{ start: 5, end: 6, text: 'Real lyric' }]);
  });

  it('filters YouTube CC stage directions and strips music-note decorations', () => {
    expect(
      parseVtt(
        `WEBVTT

00:00:20.000 --> 00:00:21.000
[MANUAL WINDING]

00:00:23.000 --> 00:00:24.000
[TURNING ON BIT]

00:00:35.000 --> 00:00:38.000
♪ (LOOK OUT FOR YOURSELF) ♪

00:00:39.000 --> 00:00:43.000
♪ I WAKE UP TO THE SOUNDS
OF THE SILENCE THAT ALLOWS ♪`,
        { source: { kind: 'youtube-cc', language: 'en' } },
      ),
    ).toEqual([
      { start: 35, end: 38, text: '(LOOK OUT FOR YOURSELF)' },
      {
        start: 39,
        end: 43,
        text: 'I WAKE UP TO THE SOUNDS\nOF THE SILENCE THAT ALLOWS',
      },
    ]);
  });

  it('filters Chinese YouTube CC music and applause cues', () => {
    expect(
      parseVtt(
        `WEBVTT

00:00:01.000 --> 00:00:02.000
[音樂]

00:00:03.000 --> 00:00:04.000
[拍手]

00:00:05.000 --> 00:00:06.000
真正的歌詞`,
        { source: { kind: 'youtube-cc', language: 'zh-TW' } },
      ),
    ).toEqual([{ start: 5, end: 6, text: '真正的歌詞' }]);
  });
  it('dedupes nearby rolling YouTube CC lyric cues', () => {
    expect(
      parseVtt(
        `WEBVTT

00:00:20.000 --> 00:00:23.000
\u7a7a\u306e\u9752\u3055

00:00:23.000 --> 00:00:25.000
\u7a7a\u306e\u9752\u3055

00:00:23.000 --> 00:00:28.000
\u7a7a\u306e\u9752\u3055
\u306b\u76ee\u3092\u596a\u308f\u308c

00:00:28.000 --> 00:00:30.000
\u306b\u76ee\u3092\u596a\u308f\u308c

00:00:28.000 --> 00:00:33.000
\u306b\u76ee\u3092\u596a\u308f\u308c
\u3066\u8db3\u3082\u5143\u306e\u82b1`,
        { source: { kind: 'youtube-cc', language: 'ja' } },
      ),
    ).toEqual([
      { start: 20, end: 23, text: '\u7a7a\u306e\u9752\u3055' },
      { start: 23, end: 28, text: '\u306b\u76ee\u3092\u596a\u308f\u308c' },
      { start: 28, end: 33, text: '\u3066\u8db3\u3082\u5143\u306e\u82b1' },
    ]);
  });

  it('keeps repeated lyrics when they are not adjacent rolling captions', () => {
    expect(
      parseVtt(
        `WEBVTT

00:00:10.000 --> 00:00:12.000
Stay with me

00:00:40.000 --> 00:00:42.000
Stay with me`,
        { source: { kind: 'youtube-cc', language: 'en' } },
      ),
    ).toEqual([
      { start: 10, end: 12, text: 'Stay with me' },
      { start: 40, end: 42, text: 'Stay with me' },
    ]);
  });

  it('removes nearby repeated rolling captions before keeping the new suffix', () => {
    expect(
      parseVtt(
        `WEBVTT

00:01:00.000 --> 00:01:08.000
\u3042\u3063\u3066\u601d\u3044\u51fa\u3059\u8272\u306e\u306a\u3044\u4e16\u754c\u6b8b\u308b\u9999\u308a\u306b\u4f1a

00:01:09.000 --> 00:01:11.000
\u3042\u3063\u3066\u601d\u3044\u51fa\u3059\u8272\u306e\u306a\u3044\u4e16\u754c\u6b8b\u308b\u9999\u308a\u306b\u4f1a

00:01:09.000 --> 00:01:15.000
\u3042\u3063\u3066\u601d\u3044\u51fa\u3059\u8272\u306e\u306a\u3044\u4e16\u754c\u6b8b\u308b\u9999\u308a\u306b\u4f1a
\u3070\u304b\u308a\u304c\u52df\u3063\u3066`,
        { source: { kind: 'youtube-cc', language: 'ja' } },
      ),
    ).toEqual([
      {
        start: 60,
        end: 68,
        text: '\u3042\u3063\u3066\u601d\u3044\u51fa\u3059\u8272\u306e\u306a\u3044\u4e16\u754c\u6b8b\u308b\u9999\u308a\u306b\u4f1a',
      },
      {
        start: 69,
        end: 75,
        text: '\u3070\u304b\u308a\u304c\u52df\u3063\u3066',
      },
    ]);
  });

  it('keeps the richest cue when nearby captions share a start time', () => {
    expect(
      parseVtt(
        `WEBVTT

00:00:10.000 --> 00:00:11.000
Line one

00:00:10.000 --> 00:00:13.000
Line one
Line two`,
        { source: { kind: 'youtube-cc', language: 'en' } },
      ),
    ).toEqual([{ start: 10, end: 13, text: 'Line one\nLine two' }]);
  });
});

describe('parseLrc', () => {
  it('preserves explicit KTV vocal cues while keeping each timestamped LRC row intact', () => {
    expect(
      parseLrc(`[00:01.00][男] 風箏在陰天擱淺，卻無法掩埋歉疚
[00:04.50][女]她的歌詞
[00:07.00][合] 一起唱`),
    ).toEqual([
      {
        start: 1,
        end: 4.5,
        text: '[男] 風箏在陰天擱淺，卻無法掩埋歉疚',
      },
      { start: 4.5, end: 7, text: '[女]她的歌詞' },
      {
        start: 7,
        end: Number.POSITIVE_INFINITY,
        text: '[合] 一起唱',
      },
    ]);
  });

  it('preserves a KTV vocal cue inside the first Enhanced LRC segment without a separate timestamp', () => {
    expect(
      parseEnhancedLrc(`[00:01.00][女]<00:01.00>她的<00:02.00>歌詞
[00:03.00]下一句`),
    ).toEqual([
      {
        start: 1,
        end: 3,
        text: '[女]她的歌詞',
        segments: [
          { text: '[女]她的', start: 1, end: 2 },
          { text: '歌詞', start: 2, end: 3 },
        ],
      },
      {
        start: 3,
        end: Number.POSITIVE_INFINITY,
        text: '下一句',
      },
    ]);
  });

  it('parses LRCLIB synced LRC lines with next-line end times', () => {
    expect(
      parseLrc(`[ar:Artist]
[00:01.00]First line
[00:04.50][00:07.00]Repeat line`),
    ).toEqual([
      { start: 1, end: 4.5, text: 'First line' },
      { start: 4.5, end: 7, text: 'Repeat line' },
      {
        start: 7,
        end: Number.POSITIVE_INFINITY,
        text: 'Repeat line',
      },
    ]);
  });

  it('parses A2 Enhanced LRC segments and an optional trailing end boundary', () => {
    expect(
      parseEnhancedLrc(`[00:01.00]<00:01.00>Hello <00:01.500>world<00:02.00>
[00:03.00]Plain fallback`),
    ).toEqual([
      {
        start: 1,
        end: 3,
        text: 'Hello world',
        segments: [
          { text: 'Hello ', start: 1, end: 1.5 },
          { text: 'world', start: 1.5, end: 2 },
        ],
      },
      {
        start: 3,
        end: Number.POSITIVE_INFINITY,
        text: 'Plain fallback',
      },
    ]);
  });

  it('preserves exact segment text and falls back to T1 for malformed timing', () => {
    expect(
      parseEnhancedLrc(`[00:01.00]<00:01.00>Hello, <00:01.50> world!
[00:03.00]<00:04.00>Late <00:03.50>boundary`),
    ).toEqual([
      {
        start: 1,
        end: 3,
        text: 'Hello,  world!',
        segments: [
          { text: 'Hello, ', start: 1, end: 1.5 },
          { text: ' world!', start: 1.5, end: 3 },
        ],
      },
      {
        start: 3,
        end: Number.POSITIVE_INFINITY,
        text: 'Late boundary',
      },
    ]);
  });

  it('falls back to T1 when a content segment starts at the next line boundary', () => {
    expect(
      parseEnhancedLrc(`[00:01.00]<00:03.00>Late
[00:03.00]Next`),
    ).toEqual([
      { start: 1, end: 3, text: 'Late' },
      { start: 3, end: Number.POSITIVE_INFINITY, text: 'Next' },
    ]);
  });

  it('routes LRCLIB sources through the LRC parser', () => {
    expect(
      parseLyricsText('[00:01.00]Hello', {
        source: {
          filename: 'lrclib-42.lrc',
          language: 'und',
          kind: 'lrclib',
        },
      }),
    ).toEqual([{ start: 1, end: Number.POSITIVE_INFINITY, text: 'Hello' }]);
  });

  it('falls back to untimed lines when an LRC/plain text source has no timestamps', () => {
    const lines = parseLrc(`[ti:Song Title]

First line

[Verse]
Second line`);

    expect(lines).toHaveLength(3);
    expect(Number.isNaN(lines[0].start)).toBe(true);
    expect(Number.isNaN(lines[0].end)).toBe(true);
    expect(lines.map((line) => line.text)).toEqual([
      'First line',
      '[Verse]',
      'Second line',
    ]);
  });

  it('renders manual plain-text imports through the LRC untimed fallback', () => {
    const lines = parseLyricsText('First line\nSecond line', {
      source: {
        filename: 'manual.lrc',
        language: 'und',
        kind: 'manual',
      },
    });

    expect(lines.map((line) => line.text)).toEqual([
      'First line',
      'Second line',
    ]);
    expect(Number.isNaN(lines[0].start)).toBe(true);
  });
});

describe('isNonLyricCue', () => {
  it('detects bracketed music and sound-effect cues', () => {
    expect(isNonLyricCue('[Music]')).toBe(true);
    expect(isNonLyricCue('(music)')).toBe(true);
    expect(isNonLyricCue('[APPLAUSE]')).toBe(true);
    expect(isNonLyricCue('[音樂]', { language: 'zh-TW' })).toBe(true);
    expect(isNonLyricCue('[拍手]', { language: 'zh-TW' })).toBe(true);
  });

  it('keeps real lyrics that contain cue-like words', () => {
    expect(isNonLyricCue('Music starts in my heart')).toBe(false);
    expect(isNonLyricCue('[Music] starts in my heart')).toBe(false);
  });

  it('for non-YouTube-CC sources, only treats blank text as a non-lyric cue', () => {
    expect(isNonLyricCue('', { sourceKind: 'manual' })).toBe(true);
    expect(isNonLyricCue('   ', { sourceKind: 'manual' })).toBe(true);
    // [Music] is a real, meaningful bracketed line for a manually-authored
    // or LRCLIB source — the YouTube-CC noise-cue heuristics don't apply.
    expect(isNonLyricCue('[Music]', { sourceKind: 'manual' })).toBe(false);
  });
});

describe('preprocessLyricCueText', () => {
  it('trims and joins non-blank lines for non-YouTube-CC sources, without noise-cue filtering', () => {
    expect(
      preprocessLyricCueText(['  First line  ', '', '[Music]', 'Last line'], {
        sourceKind: 'manual',
      }),
    ).toBe('First line\n[Music]\nLast line');
  });

  it('accepts a raw string and splits it into lines for non-YouTube-CC sources', () => {
    expect(
      preprocessLyricCueText('First line\n\nSecond line', {
        sourceKind: 'manual',
      }),
    ).toBe('First line\nSecond line');
  });

  it('applies YouTube-CC noise-cue filtering by default', () => {
    expect(preprocessLyricCueText(['[Music]', 'Real lyric line'])).toBe(
      'Real lyric line',
    );
  });
});

describe('formatLyricTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatLyricTime(65.9)).toBe('1:05');
    expect(formatLyricTime(Number.NaN)).toBe('--:--');
  });
});

describe('inferPreferredLyricsLanguagePrefixes', () => {
  it('infers Chinese for Chinese title text', () => {
    expect(
      inferPreferredLyricsLanguagePrefixes({
        title: '你到底在選擇什麼 Official Music Video',
        artist: 'GGteens',
      }),
    ).toEqual(['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo', 'zh']);
  });

  it('infers Japanese when kana is present', () => {
    expect(
      inferPreferredLyricsLanguagePrefixes({
        title: 'アイドル',
        artist: 'YOASOBI',
      }),
    ).toEqual(['ja']);
  });

  it('infers Korean when hangul is present', () => {
    expect(
      inferPreferredLyricsLanguagePrefixes({
        title: 'I NEED U',
        artist: 'BTS (방탄소년단)',
      }),
    ).toEqual(['ko']);
  });

  it('infers English for latin-only metadata', () => {
    expect(
      inferPreferredLyricsLanguagePrefixes({
        title: 'Enemy',
        artist: 'Imagine Dragons',
      }),
    ).toEqual(['en']);
  });
});

describe('detectLyricsScript', () => {
  it('requires actual kana to call something Japanese, not just kanji', () => {
    expect(detectLyricsScript('アイドル')).toBe('ja');
    expect(detectLyricsScript('恋におちて')).toBe('ja');
    expect(detectLyricsScript('你到底在選擇什麼')).toBe('zh');
  });

  it('detects Korean via hangul', () => {
    expect(detectLyricsScript('사랑해')).toBe('ko');
  });

  it('decides ja/ko by character-count majority, not which script appears first', () => {
    // A handful of Korean characters inside an otherwise-Japanese lyric
    // (or vice versa) must not flip the whole thing's reading-aid mode —
    // Korean songs commonly code-switch into English, and Japanese songs
    // occasionally borrow a Korean word or two.
    expect(detectLyricsScript('こんにちは 안녕')).toBe('ja');
    expect(detectLyricsScript('오늘 날씨가 정말 좋네요 ね')).toBe('ko');
  });

  it('detects latin-only text', () => {
    expect(detectLyricsScript('Enemy')).toBe('latin');
  });

  it('falls back to unknown for empty or symbol-only text', () => {
    expect(detectLyricsScript('')).toBe('unknown');
    expect(detectLyricsScript('♪♪♪')).toBe('unknown');
    expect(detectLyricsScript(null)).toBe('unknown');
  });
});

describe('alignReadings', () => {
  it('aligns reading v2 by stable line id even when line order changes', () => {
    const lyricLines = [
      { lineId: 'line_2', text: 'Second' },
      { lineId: 'line_1', text: 'First' },
    ];
    const readingDoc = {
      version: 2,
      lines: [
        { lineId: 'line_1', text: 'First', romaji: 'first' },
        { lineId: 'line_2', text: 'Second', romaji: 'second' },
      ],
    };

    expect(
      alignReadings(lyricLines, readingDoc).map((line) => line.romaji),
    ).toEqual(['second', 'first']);
  });

  const lyricLines = [
    { start: 0, end: 2, text: '歌う声' },
    { start: 2, end: 4, text: 'です' },
  ];

  it('zips matching lines by index+text', () => {
    const readingDoc = {
      lines: [
        { text: '歌う声', segments: [{ t: '歌', r: 'うた' }], romaji: 'utau' },
        { text: 'です', segments: [{ t: 'です' }], romaji: 'desu' },
      ],
    };

    expect(alignReadings(lyricLines, readingDoc)).toEqual(readingDoc.lines);
  });

  it('returns null for a line whose text no longer matches the saved doc', () => {
    const readingDoc = {
      lines: [
        { text: '歌う声（変更後）', segments: [], romaji: '' },
        { text: 'です', segments: [{ t: 'です' }], romaji: 'desu' },
      ],
    };

    const result = alignReadings(lyricLines, readingDoc);
    expect(result[0]).toBeNull();
    expect(result[1]).toEqual(readingDoc.lines[1]);
  });

  it('returns an all-null array when there is no reading doc', () => {
    expect(alignReadings(lyricLines, null)).toEqual([null, null]);
  });

  it('returns null for indexes past the end of a shorter reading doc', () => {
    const readingDoc = {
      lines: [{ text: '歌う声', segments: [], romaji: '' }],
    };
    expect(alignReadings(lyricLines, readingDoc)[1]).toBeNull();
  });
});

describe('pickPreferredLyricsSource', () => {
  const sources = [
    { filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' },
    { filename: 'zh-Hant.vtt', language: 'zh-Hant', kind: 'youtube-cc' },
    { filename: 'en.vtt', language: 'en', kind: 'youtube-cc' },
  ];

  it('picks Chinese captions for Chinese songs instead of the first source', () => {
    expect(
      pickPreferredLyricsSource({
        title: '沒空想你',
        artist: 'Sabrina',
        lyrics: { status: 'available', sources },
      }),
    ).toEqual(sources[1]);
  });

  it('prefers zh-TW over simplified Chinese for Chinese songs', () => {
    const chineseSources = [
      { filename: 'zh-Hans.vtt', language: 'zh-Hans', kind: 'youtube-cc' },
      { filename: 'zh-TW.vtt', language: 'zh-TW', kind: 'youtube-cc' },
    ];

    expect(
      pickPreferredLyricsSource({
        title: '你到底在選擇什麼',
        artist: 'GGteens',
        lyrics: { status: 'available', sources: chineseSources },
      }),
    ).toEqual(chineseSources[1]);
  });

  it('preserves the current filename when requested for the same track', () => {
    expect(
      pickPreferredLyricsSource(
        {
          title: '沒空想你',
          artist: 'Sabrina',
          lyrics: { status: 'available', sources },
        },
        'ja.vtt',
      ),
    ).toEqual(sources[0]);
  });

  it('falls back to the first source when there is no useful language hint', () => {
    expect(
      pickPreferredLyricsSource({
        title: '12345',
        artist: '',
        lyrics: { status: 'available', sources },
      }),
    ).toEqual(sources[0]);
  });
});

describe('formatLyricsSourceLabel', () => {
  it('leads with the kind label, followed by a real language', () => {
    expect(
      formatLyricsSourceLabel({ language: 'ja', kind: 'youtube-cc' }),
    ).toBe('YouTube CC / JA');
  });

  it('falls back to the raw kind string when unrecognized', () => {
    expect(formatLyricsSourceLabel({ language: 'ja', kind: 'other' })).toBe(
      'other / JA',
    );
  });

  // lrclib's API has no language field — every lrclib source is stamped
  // 'und', which carries no real information and must not be displayed.
  it('omits the language segment entirely for "und"', () => {
    expect(formatLyricsSourceLabel({ language: 'und', kind: 'lrclib' })).toBe(
      'LRCLIB',
    );
  });

  it('uses the AMLL TTML provider label', () => {
    expect(formatLyricsSourceLabel({ language: 'und', kind: 'amll' })).toBe(
      'AMLL TTML',
    );
  });

  it('uses the Better Lyrics provider label', () => {
    expect(
      formatLyricsSourceLabel({ language: 'und', kind: 'betterlyrics' }),
    ).toBe('Better Lyrics');
  });

  it('uses the label in place of an unreal language', () => {
    expect(
      formatLyricsSourceLabel({
        language: 'und',
        kind: 'lrclib',
        label: 'Short n Sweet',
      }),
    ).toBe('LRCLIB / Short n Sweet');
  });

  it('shows both when a real language and a label are both present', () => {
    expect(
      formatLyricsSourceLabel({
        language: 'ja',
        kind: 'youtube-cc',
        label: 'Live Version',
      }),
    ).toBe('YouTube CC / JA · Live Version');
  });
});

describe('formatLyricsSourceOffset', () => {
  it.each([
    [undefined, '0.0s'],
    [0, '0.0s'],
    [250, '+0.3s'],
    [-1200, '-1.2s'],
  ])('formats persisted offset %s as %s', (offsetMs, expected) => {
    expect(formatLyricsSourceOffset(offsetMs)).toBe(expected);
  });
});

describe('formatLyricsSourceTier', () => {
  it.each([
    ['T0', 'T0'],
    ['T1', 'T1'],
    ['T2', 'T2'],
    [undefined, '—'],
    ['unsupported', '—'],
  ])('formats source tier %s as %s', (tier, expected) => {
    expect(formatLyricsSourceTier(tier)).toBe(expected);
  });
});
