import { describe, it, expect } from 'vitest';
import { editFlacComments, inspectFlac } from './flac.js';

function block(type, data, last = false) {
  const header = Buffer.alloc(4);
  header[0] = type | (last ? 128 : 0);
  header.writeUIntBE(data.length, 1, 3);
  return Buffer.concat([header, data]);
}
function comments(entries) {
  const text = (v) => {
    const b = Buffer.from(v),
      n = Buffer.alloc(4);
    n.writeUInt32LE(b.length);
    return Buffer.concat([n, b]);
  };
  const n = Buffer.alloc(4);
  n.writeUInt32LE(entries.length);
  return Buffer.concat([text('original vendor'), n, ...entries.map(text)]);
}
function fixture(
  entries = ['TITLE=Old', 'X-CUSTOM=keep', 'ARTIST=A', 'ARTIST=B'],
) {
  return Buffer.concat([
    Buffer.from('fLaC'),
    block(0, Buffer.alloc(34, 1)),
    block(2, Buffer.from('UTWK\u0000opaque')),
    block(4, comments(entries)),
    block(6, Buffer.from('picture bytes'), true),
    Buffer.from([255, 248, 10, 11, 12, 0, 255]),
  ]);
}
describe('bounded FLAC comment-only writer', () => {
  it('changes only explicitly chosen comments and retains the exact encoded audio and all other blocks', () => {
    const original = fixture();
    const before = inspectFlac(original);
    const edited = editFlacComments(original, {
      TITLE: ['新標題'],
      DATE: ['2024-10'],
      TRACKNUMBER: ['2'],
      TRACKTOTAL: ['12'],
    });
    const after = inspectFlac(edited);
    expect(before.audio.equals(after.audio)).toBe(true);
    expect(before.blocks.filter((b) => b.type !== 4)).toEqual(
      after.blocks.filter((b) => b.type !== 4),
    );
    expect(after.vendor).toEqual(before.vendor);
    expect(after.comments).toEqual([
      'X-CUSTOM=keep',
      'ARTIST=A',
      'ARTIST=B',
      'TITLE=新標題',
      'DATE=2024-10',
      'TRACKNUMBER=2',
      'TRACKTOTAL=12',
    ]);
    expect(inspectFlac(original).comments[0]).toBe('TITLE=Old');
  });
  it('clears all case-insensitive instances of only a selected key and retains multi-value foreign comments', () => {
    const data = editFlacComments(
      fixture([
        'TITLE=A',
        'title=B',
        'ORIGINALDATE=1999',
        'REPLAYGAIN_TRACK_GAIN=-7.12 dB',
      ]),
      { TITLE: [] },
    );
    expect(inspectFlac(data).comments).toEqual([
      'ORIGINALDATE=1999',
      'REPLAYGAIN_TRACK_GAIN=-7.12 dB',
    ]);
  });
  it('adds a comment block when absent and updates only the last-block marker', () => {
    const source = Buffer.concat([
      Buffer.from('fLaC'),
      block(0, Buffer.alloc(34), true),
      Buffer.from([255, 248, 0]),
    ]);
    const after = inspectFlac(editFlacComments(source, { TITLE: ['title'] }));
    expect(after.comments).toEqual(['TITLE=title']);
    expect(after.audio).toEqual(Buffer.from([255, 248, 0]));
    expect(after.blocks[0].data).toEqual(Buffer.alloc(34));
  });
  it.each([
    Buffer.from('not flac'),
    Buffer.concat([
      Buffer.from('fLaC'),
      block(0, Buffer.alloc(33), true),
      Buffer.from([255, 248, 0]),
    ]),
    Buffer.concat([
      Buffer.from('fLaC'),
      block(0, Buffer.alloc(34)),
      block(4, comments([])),
      block(4, comments([]), true),
      Buffer.from([255, 248, 0]),
    ]),
    Buffer.concat([Buffer.from('ID3'), fixture()]),
    fixture().subarray(0, 20),
  ])(
    'rejects ambiguous or malformed profiles without changing input',
    (source) => {
      const saved = Buffer.from(source);
      expect(() => editFlacComments(source, { TITLE: ['value'] })).toThrow();
      expect(source).toEqual(saved);
    },
  );
  it('rejects arbitrary keys, oversized values and unsupported value types', () => {
    for (const input of [
      { PRIVATE: ['x'] },
      { TITLE: 'x' },
      { TITLE: ['x'.repeat(501)] },
      { TITLE: ['a\u0000b'] },
    ])
      expect(() => editFlacComments(fixture(), input)).toThrow();
  });
});
