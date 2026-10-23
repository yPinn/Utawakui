import { describe, expect, it } from 'vitest';
import { parseLrc, parseVtt } from './lyrics.js';
import { parseLrcLines } from '../../electron/lib/lrclib/lrc.js';

const cc = (rows) => `WEBVTT\n\n${rows.join('\n\n')}`;
const cue = (start, end, text) =>
  `00:00:${start}.000 --> 00:00:${end}.000\n${text}`;

describe('source fidelity before template processing', () => {
  it.each([
    'I <3 you <forever>',
    '[女]記得[02:00]的約定（和聲）',
    '【今晚】「一起，唱吧」',
    '【今晚】「一起，唱吧」简体歌词',
    '[Female] I LOVE YOU (oh oh)',
    '[女]「明日、一緒に歌おう」（ハモリ）',
    '[여] 오늘도 함께 (화음)',
  ])('keeps literal text in timed LRC: %s', (text) => {
    expect(parseLrc(`[00:01.000]${text}`)[0].text).toBe(text);
    expect(parseLrcLines(`[00:01.000]${text}`)[0].text).toBe(text);
  });

  it('retains literal angle text beside valid enhanced timestamps', () => {
    const line = parseLrc(
      '[00:01.00][女]<00:01.00>I <3 you <forever><00:03.00>',
    )[0];
    expect(line.text).toBe('[女]I <3 you <forever>');
    expect(line.segments.map((s) => s.text).join('')).toBe(line.text);
  });

  it('normalizes text line separators without rewriting graphemes', () => {
    expect(
      parseLrc('\uFEFF你好\r简体\u2028が\u2029한\n👩‍🎤').map((l) => l.text),
    ).toEqual(['你好', '简体', 'が', '한', '👩‍🎤']);
  });

  it('preserves real repeated CC lines with adjacent or separated intervals', () => {
    const rows = parseVtt(
      cc([
        cue('01', '03', 'La la la'),
        cue('03', '05', 'La la la'),
        cue('06', '08', 'La la la'),
      ]),
    );
    expect(rows.map((r) => r.text)).toEqual([
      'La la la',
      'La la la',
      'La la la',
    ]);
  });

  it.each([
    '[I LOVE YOU]',
    'Music',
    '(music)',
    '[女] 一起唱',
    '【合唱】一起唱',
    '(oh oh)',
    '[작사처럼 노래해]',
  ])('preserves ambiguous sung or vocal CC text: %s', (text) => {
    expect(parseVtt(cc([cue('01', '03', text)]))[0]?.text).toBe(text);
  });

  it('keeps simultaneous distinct vocal cues and strips only recognized VTT syntax', () => {
    const rows = parseVtt(
      cc([
        cue('01', '03', '<v Alice><b>我 <3 你</b></v>'),
        cue('01', '03', '[Bob] (和聲)'),
      ]),
    );
    expect(rows.map((r) => r.text)).toEqual([
      '[Alice] 我 <3 你',
      '[Bob] (和聲)',
    ]);
  });
});
