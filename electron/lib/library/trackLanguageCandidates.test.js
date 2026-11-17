import { describe, expect, it } from 'vitest';
import {
  candidatePrecision,
  inferTrackLanguages,
  lyricLines,
  lyricsLanguages,
  titleHint,
} from './trackLanguageCandidates.js';

const lrc = (lines) =>
  lines.map((line, i) => `[00:${10 + i}.00]${line}`).join('\n');
const zh = [
  '我走過的路',
  '你看見的光',
  '風吹過城市',
  '夜裡的街燈',
  '還在等你嗎',
  '慢慢地說再見',
];
const ja = [
  '君の声が聞こえる',
  '夜空に光る星',
  '遠く離れても',
  'ずっとそばにいて',
  '涙がこぼれた',
  '明日へ歩こう',
];
const ko = [
  '너를 처음 만난 날',
  '우리 함께 걸어요',
  '밤하늘 별처럼',
  '기억해 줘요',
  '눈물이 흘러도',
  '다시 시작해',
];
const en = [
  'I keep on running',
  'Never let you go',
  'Hold me tonight',
  'All the city lights',
  'You are my heart',
  'We can be free',
];

describe('lyrics evidence', () => {
  it('drops credits, NetEase credit rows, timestamps and repeated lines', () => {
    const text = [
      '{"t":0,"c":[{"tx":"作词: "},{"tx":"某人"}]}',
      '[00:01.00]作曲：某人',
      '[00:02.00]Always online',
      '[00:30.00]Always online!',
      '[00:31.00]我走過的路',
    ].join('\n');
    expect(lyricLines(text)).toEqual(['Always online', '我走過的路']);
  });

  it('drops bilingual NetEase credit lines and reads instrumental notes', () => {
    const credits = [
      '{"t":2451,"c":[{"tx":"歌手 Artist: "},{"tx":"Band"}]}',
      '[00:01.00]母带工程师 Mastering Engineer: Chris Gehringer',
      '[00:02.00]和声编写 Backing Vocals Arrangement: Someone',
      '[00:03.00]录音室 Recording Studio: On Studio',
    ];
    expect(
      lyricLines([...credits, '[00:10.00]花开后结成果'].join('\n')),
    ).toEqual(['花开后结成果']);
    expect(
      lyricsLanguages([...credits, '[00:05.00]纯音乐，请欣赏'].join('\n')),
    ).toMatchObject({
      languages: ['zxx'],
      evidence: { source: 'lyrics-instrumental' },
    });
  });

  it('keeps a CJK verse in an English song at a lower share', () => {
    const verse = [
      '통제 불능 머리 춤',
      '뛰어 미친놈인 듯',
      '다들 모여 하나 둘',
      '우린 함께 춤춰',
    ];
    const english = [
      ...en,
      ...en.map((l) => `${l} again`),
      ...en.map((l) => `Oh ${l}`),
    ];
    expect(
      lyricsLanguages(lrc([...english.slice(0, 18), ...verse])).languages,
    ).toEqual(['ko', 'en']);
  });

  it('does not call a repeated English hook a second language', () => {
    const hook = Array(10).fill('Always online');
    expect(
      lyricsLanguages(lrc([...zh, ...zh.map((l) => `${l}啊`), ...hook])),
    ).toMatchObject({
      languages: ['zh'],
      confidence: 'high',
    });
  });

  it('needs four lines and a fifth of the song for a second language', () => {
    expect(lyricsLanguages(lrc([...zh, ...en.slice(0, 3)])).languages).toEqual([
      'zh',
    ]);
    expect(lyricsLanguages(lrc([...zh, ...en])).languages).toEqual([
      'zh',
      'en',
    ]);
  });

  it('counts Han-only lines as Japanese in a kana song', () => {
    const result = lyricsLanguages(
      lrc([...ja, '永遠', '運命の夜', '花鳥風月']),
    );
    expect(result.languages).toEqual(['ja']);
  });

  it('gives a mixed line to its dominant script', () => {
    const lines = [...ko, "I'm so 사랑해 너를 정말로", 'Baby 너만 보여 오늘도'];
    expect(lyricsLanguages(lrc(lines)).languages).toEqual(['ko']);
  });

  it('folds romanized lines into the Japanese song they transcribe', () => {
    const romaji = [
      'kimi no koe ga kikoeru',
      'yozora ni hikaru hoshi',
      'zutto soba ni ite',
      'ashita e arukou',
    ];
    expect(lyricsLanguages(lrc([...ja, ...romaji])).languages).toEqual(['ja']);
  });

  it('ignores too little lyrics', () => {
    expect(lyricsLanguages(lrc(zh.slice(0, 3)))).toBeNull();
  });
});

describe('title evidence', () => {
  it('reads language versions and instrumental markers', () => {
    expect(titleHint('Butter (English Ver.)').languages).toEqual(['en']);
    expect(titleHint('Lemon - Japanese Version').languages).toEqual(['ja']);
    expect(titleHint('告白氣球 (中文版)').languages).toEqual(['zh']);
    expect(titleHint('夜に駆ける (Off Vocal)').languages).toEqual(['zxx']);
    expect(titleHint('Song (Inst.)').languages).toEqual(['zxx']);
    expect(titleHint('Song (with instrumental by Someone)')).toBeNull();
    expect(titleHint('Instant Crush')).toBeNull();
  });
});

describe('track inference', () => {
  const artistTracks = (n, lines, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      title: `Song ${i}`,
      artist: 'Band',
      lyricsText: lrc(lines.map((line) => `${line}${i}`)),
      ...extra,
    }));

  it('keeps manual languages and lets a version title beat the lyrics', () => {
    const results = inferTrackLanguages([
      {
        id: 'm',
        title: 'Any',
        artist: 'X',
        lyricsText: lrc(zh),
        manual: ['ja'],
      },
      {
        id: 'v',
        title: 'Song (Korean Ver.)',
        artist: 'X',
        lyricsText: lrc(ja),
      },
    ]);
    expect(results.get('m')).toMatchObject({
      languages: ['ja'],
      confidence: 'manual',
    });
    expect(results.get('v')).toMatchObject({
      languages: ['ko'],
      evidence: { source: 'title-version' },
    });
  });

  it('gives lyric-less tracks only the artist main language', () => {
    const tracks = [
      ...artistTracks(4, ko),
      {
        id: 'mixed',
        title: 'Mixed',
        artist: 'Band',
        lyricsText: lrc([...ko, ...en]),
      },
      { id: 'skit', title: 'Skit: Hello', artist: 'Band (밴드)' },
    ];
    expect(inferTrackLanguages(tracks).get('skit')).toMatchObject({
      languages: ['ko'],
      confidence: 'low',
      evidence: { source: 'artist', tracks: 5, matching: 5 },
    });
  });

  it('needs five typical tracks and a clear majority from the artist', () => {
    const few = [
      ...artistTracks(4, ko),
      { id: 'x', title: 'Untitled', artist: 'Band' },
    ];
    expect(inferTrackLanguages(few).get('x')).toBeUndefined();
    const covers = [
      ...artistTracks(5, en, { title: 'Song (Cover)' }),
      { id: 'x', title: 'Untitled', artist: 'Band' },
    ];
    expect(inferTrackLanguages(covers).get('x')).toBeUndefined();
    const split = [
      ...artistTracks(3, ko),
      ...artistTracks(3, ja).map((t) => ({ ...t, id: `j${t.id}` })),
      { id: 'x', title: 'Untitled', artist: 'Band' },
    ];
    expect(inferTrackLanguages(split).get('x')).toBeUndefined();
  });

  it('falls back to the title script', () => {
    expect(
      inferTrackLanguages([{ id: 't', title: '夜に駆ける', artist: 'Y' }]).get(
        't',
      ),
    ).toMatchObject({
      languages: ['ja'],
      evidence: { source: 'title-script' },
    });
  });

  it('measures blind precision against manual tracks', () => {
    const tracks = [
      { id: 'a', title: 'A', artist: 'X', lyricsText: lrc(zh), manual: ['zh'] },
      {
        id: 'b',
        title: 'B',
        artist: 'X',
        lyricsText: lrc(en),
        manual: ['zh', 'en'],
      },
      { id: 'c', title: '歌', artist: 'Y', manual: ['ja'] },
    ];
    expect(candidatePrecision(tracks)).toEqual({
      lyrics: { checked: 2, exact: 1 },
      'title-script': { checked: 1, exact: 0 },
    });
  });
});
