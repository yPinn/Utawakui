import { describe, expect, it } from 'vitest';
import outputStreamContract from '../../shared/outputStreamContract.js';
import { projectLyricsTextSelection } from '../../shared/presentation/lyricsTextProcessing.mjs';

const {
  OUTPUT_V3_SUBPROTOCOL,
  assembleOutputSnapshotV2,
  parseOutputStreamEnvelope,
} = outputStreamContract;

const identity = {
  contractVersion: 3,
  bootId: 'boot-1',
  sourceEpoch: 'epoch-1',
  kind: 'full',
  revision: 1,
};

describe('filtered text source boundaries', () => {
  it('keeps derived document identity within the Main limit for maximum-length source ids', () => {
    const value = lyricsEnvelope();
    value.payload.document.documentId = 'd'.repeat(128);
    value.payload.document.granularity = 'T1';
    value.payload.document.lines = [
      { lineId: 'v', text: '[男]一起唱', startMs: 0, endMs: 5000 },
    ];
    value.payload.document = projectLyricsTextSelection(
      value.payload.document,
      ['v'],
    );
    expect(value.payload.document.documentId.length).toBeLessThanOrEqual(128);
    expect(
      parseOutputStreamEnvelope(value, 'boot-1').payload.document.lines[0],
    ).toMatchObject({ text: '一起唱', vocalParts: [{ role: 'male' }] });
  });

  it.each([[[]], [[{ from: 0, to: 2, label: '女', role: 'female' }]]])(
    'preserves bounded vocal metadata %j',
    (parts) => {
      const value = lyricsEnvelope();
      value.payload.document.granularity = 'T1';
      value.payload.document.lines = [
        {
          lineId: 'v',
          text: '一起唱',
          startMs: 0,
          endMs: 5000,
          vocalParts: parts,
        },
      ];
      expect(
        parseOutputStreamEnvelope(value, 'boot-1').payload.document.lines[0]
          .vocalParts,
      ).toEqual(parts);
    },
  );
  it.each(
    [
      [{ from: -1, to: 2, label: '男', role: 'male' }],
      [{ from: 0, to: 4, label: '男', role: 'male' }],
      [{ from: 0, to: 0, label: '男', role: 'male' }],
      [{ from: 0, to: 2, label: '男', role: 'other' }],
      [{ from: 0, to: 2, label: '', role: 'male' }],
      [{ from: 0, to: 2, label: '男', role: 'male', extra: true }],
      [
        { from: 0, to: 2, label: '男', role: 'male' },
        { from: 1, to: 3, label: '女', role: 'female' },
      ],
    ].map((parts) => [parts]),
  )('rejects invalid vocal ranges %j', (parts) => {
    const value = lyricsEnvelope();
    value.payload.document.granularity = 'T1';
    value.payload.document.lines = [
      {
        lineId: 'v',
        text: '一起唱',
        startMs: 0,
        endMs: 5000,
        vocalParts: parts,
      },
    ];
    expect(() => parseOutputStreamEnvelope(value, 'boot-1')).toThrow(
      /vocalParts/,
    );
  });

  it.each(['T2', 'T1+'])(
    'accepts label-free %s text and aligned Japanese reading',
    (tier) => {
      const value = lyricsEnvelope(),
        text = '（和聲）空へ';
      value.payload.document.source = {
        ...value.payload.document.source,
        language: 'ja',
      };
      const line = { lineId: 'voice', text, startMs: 1000, endMs: 6000 };
      if (tier === 'T2') {
        value.payload.document.granularity = 'T2';
        line.segments = [
          { segmentId: 'cue', text: '（和聲）', startMs: 1000, endMs: 2000 },
          { segmentId: 'body', text: '空へ', startMs: 2000, endMs: 6000 },
        ];
      } else {
        value.payload.document.granularity = 'T1';
        line.estimatedStarts = {
          version: 1,
          segments: [
            { segmentId: 'cue', text: '（和聲）', startMs: 1000 },
            { segmentId: 'body', text: '空へ', startMs: 2000 },
          ],
        };
        line.estimatedFineTiming = {
          version: 1,
          units: [
            { unitId: 'fine-cue', from: 0, to: 4, startMs: 1000, endMs: 1800 },
            { unitId: 'fine-body', from: 4, to: 6, startMs: 2000, endMs: 5000 },
          ],
        };
      }
      value.payload.document.lines = [line];
      value.payload.document.reading = {
        lines: [
          {
            lineId: 'voice',
            text,
            segments: [
              { text: '（和聲）', reading: 'metadata' },
              { text: '空へ', reading: 'そらへ' },
            ],
          },
        ],
      };
      value.payload.document = projectLyricsTextSelection(
        value.payload.document,
        ['voice'],
      );
      const parsed = parseOutputStreamEnvelope(value, 'boot-1').payload
        .document;
      expect(parsed.lines[0].text).toBe('空へ');
      expect(parsed.reading.lines[0]).toEqual({
        lineId: 'voice',
        text: '空へ',
        segments: [{ text: '空へ', reading: 'そらへ' }],
      });
      if (tier === 'T2')
        expect(parsed.lines[0].segments[0]).toMatchObject({
          startMs: 2000,
          endMs: 6000,
        });
      else
        expect(parsed.lines[0].estimatedFineTiming.units[0]).toEqual({
          unitId: 'fine-body',
          from: 0,
          to: 2,
          startMs: 2000,
          endMs: 5000,
        });
    },
  );
  it.each(['（和聲）', '混音 Mixing Engineer: 王曉夫'])(
    'accepts the original inferred boundary when the following %s is hidden',
    (text) => {
      const value = lyricsEnvelope();
      value.payload.document.granularity = 'T1';
      value.payload.document.lines = [
        {
          lineId: 'before',
          text: '前句',
          startMs: 0,
          endMs: 1000,
          endInferred: true,
        },
        {
          lineId: 'hidden',
          text,
          startMs: 1000,
          endMs: 2000,
          endInferred: true,
        },
        { lineId: 'after', text: '次句', startMs: 2000, endMs: 3000 },
      ];
      value.payload.document = projectLyricsTextSelection(
        value.payload.document,
        ['hidden'],
      );
      const parsed = parseOutputStreamEnvelope(value, 'boot-1').payload
        .document;
      expect(parsed.lines[0]).toMatchObject({ endMs: 1000, endInferred: true });
      expect(parsed.lines[1].startMs).toBe(2000);
    },
  );
  it('accepts a retained inferred end before hidden trailing credits and still rejects overlap', () => {
    const value = lyricsEnvelope();
    value.payload.document.granularity = 'T1';
    value.payload.document.lines = [
      { lineId: 'before', text: '前句', startMs: 0, endMs: null },
      {
        lineId: 'hidden',
        text: '母帶 Mastering Engineer: Craig J Williams',
        startMs: 1000,
        endMs: 2000,
      },
    ];
    value.payload.document = projectLyricsTextSelection(
      value.payload.document,
      ['hidden'],
    );
    expect(
      parseOutputStreamEnvelope(value, 'boot-1').payload.document.lines[0],
    ).toMatchObject({ endMs: 1000, endInferred: true });
    value.payload.document.lines.push({
      lineId: 'next',
      text: '次句',
      startMs: 900,
      endMs: 1500,
    });
    expect(() => parseOutputStreamEnvelope(value, 'boot-1')).toThrow();
    value.payload.document.lines.splice(1, 0, {
      lineId: 'untimed',
      text: '未校時文字',
      startMs: null,
      endMs: null,
    });
    expect(() => parseOutputStreamEnvelope(value, 'boot-1')).toThrow();
  });
});

describe('bounded model-start extension', () => {
  function modelEnvelope() {
    const value = lyricsEnvelope();
    value.payload.document.granularity = 'T1';
    delete value.payload.document.lines[0].segments;
    value.payload.document.lines[0].estimatedStarts = {
      version: 1,
      segments: [
        { segmentId: 'model-a', text: '歌詞', startMs: 1200 },
        { segmentId: 'model-b', text: 'です', startMs: 2200 },
      ],
    };
    return value;
  }
  it('accepts separately bounded fine intervals and discards invalid fine without losing starts', () => {
    const value = modelEnvelope();
    const line = value.payload.document.lines[0];
    line.estimatedFineTiming = {
      version: 1,
      units: [
        { unitId: 'fine-a', from: 0, to: 1, startMs: 1250, endMs: 1450 },
        { unitId: 'fine-b', from: 1, to: 2, startMs: 1500, endMs: 2000 },
      ],
    };
    const parsed = parseOutputStreamEnvelope(value, 'boot-1').payload.document
      .lines[0];
    expect(parsed.estimatedFineTiming).toEqual(line.estimatedFineTiming);
    expect(parsed.estimatedStarts).toEqual(line.estimatedStarts);
    const later = structuredClone(value);
    later.payload.document.lines.push({
      lineId: 'fine-a',
      text: '次',
      startMs: 4000,
      endMs: 5000,
    });
    expect(
      parseOutputStreamEnvelope(later, 'boot-1').payload.document.lines[0],
    ).not.toHaveProperty('estimatedFineTiming');
    for (const mutation of [
      (f) => {
        f.version = 2;
      },
      (f) => {
        f.units[0].endMs = 1000;
      },
      (f) => {
        f.units[0].from = 10;
      },
      (f) => {
        f.units[1].startMs = 1300;
      },
      (f) => {
        f.units[0].unitId = 'model-a';
      },
      (f) => {
        f.privatePath = 'secret';
      },
    ]) {
      const copy = structuredClone(value);
      mutation(copy.payload.document.lines[0].estimatedFineTiming);
      const output = parseOutputStreamEnvelope(copy, 'boot-1').payload.document
        .lines[0];
      expect(output).not.toHaveProperty('estimatedFineTiming');
      expect(output.estimatedStarts).toEqual(line.estimatedStarts);
    }
  });
  it('keeps canonical T1 provenance and never adds a model singing end', () => {
    const value = modelEnvelope();
    delete value.payload.document.source.privatePath;
    expect(parseOutputStreamEnvelope(value, 'boot-1')).toEqual(value);
  });
  it.each([
    (extension) => {
      extension.version = 2;
    },
    (extension) => {
      extension.segments[0].endMs = 2000;
    },
    (extension) => {
      extension.segments[0].startMs = 999;
    },
    (extension) => {
      extension.segments[1].startMs = 1100;
    },
    (extension) => {
      extension.segments[1].startMs = 3001;
    },
    (extension) => {
      extension.segments[0].text = '錯字';
    },
    (extension) => {
      extension.segments[1].segmentId = 'model-a';
    },
  ])('rejects malformed model-start evidence', (mutate) => {
    const value = modelEnvelope();
    mutate(value.payload.document.lines[0].estimatedStarts);
    expect(() => parseOutputStreamEnvelope(value, 'boot-1')).toThrow();
  });
});

function lyricsEnvelope(overrides = {}) {
  return {
    ...identity,
    stream: 'lyrics.document',
    payload: {
      document: {
        documentId: 'lyrics-1',
        trackId: 'track-1',
        granularity: 'T2',
        source: { language: 'ja', privatePath: 'C:\\secret.lrc' },
        lines: [
          {
            lineId: 'line-1',
            text: '歌詞です',
            startMs: 1000,
            endMs: 3000,
            segments: [
              {
                segmentId: 'segment-1',
                text: '歌詞',
                startMs: 1000,
                endMs: 2000,
              },
              {
                segmentId: 'segment-2',
                text: 'です',
                startMs: 2000,
                endMs: 3000,
              },
            ],
          },
        ],
      },
    },
    ...overrides,
  };
}

function queueEnvelope(overrides = {}) {
  return {
    ...identity,
    stream: 'queue.document',
    payload: {
      document: {
        documentId: 'queue-current',
        sourceName: 'Tonight',
        items: [
          {
            state: 'current',
            track: { id: 'track-1', title: 'Song', artist: 'Singer' },
          },
        ],
      },
    },
    ...overrides,
  };
}

function musicStructureEnvelope(overrides = {}) {
  return {
    ...identity,
    stream: 'music-structure.document',
    payload: {
      document: {
        documentId: `music-structure-${'a'.repeat(64)}`,
        trackId: 'track-1',
        sourceRevision: 'a'.repeat(64),
        sourceDurationMs: 180000,
        level: 'M2',
        tempo: { bpm: 120, confidence: 0.82 },
        beats: [
          {
            timeMs: 500,
            positionInBar: 1,
            downbeat: true,
            confidence: 0.9,
          },
        ],
        sections: [
          {
            sectionId: 'section_1',
            startMs: 0,
            endMs: 10000,
            role: 'chorus',
            confidence: 0.76,
          },
        ],
      },
    },
    ...overrides,
  };
}

function stateEnvelope(overrides = {}) {
  return {
    ...identity,
    stream: 'state.snapshot',
    payload: {
      generatedAt: '2026-08-23T00:00:00.000Z',
      displayDelayMs: 250,
      playback: {
        status: 'playing',
        positionMs: 1500,
        durationMs: 180000,
        rate: 1,
        track: { id: 'track-1', title: 'Song', artist: 'Singer' },
      },
      lyrics: {
        documentId: 'lyrics-1',
        documentRevision: 1,
        offsetMs: 0,
        activeLineId: 'line-1',
        activeSegmentId: 'segment-1',
      },
      queue: { documentId: 'queue-current', documentRevision: 1 },
      musicStructure: {
        documentId: `music-structure-${'a'.repeat(64)}`,
        documentRevision: 1,
      },
    },
    ...overrides,
  };
}

describe('output stream contract', () => {
  it('retains bounded audio state in state envelopes and rejects invalid values', () => {
    const envelope = stateEnvelope();
    envelope.payload.playback.volume = 0.42;
    envelope.payload.playback.muted = false;
    expect(
      parseOutputStreamEnvelope(envelope, 'boot-1').payload.playback,
    ).toMatchObject({ volume: 0.42, muted: false });
    for (const volume of [-1, 2, NaN, '0.4']) {
      envelope.payload.playback.volume = volume;
      expect(() => parseOutputStreamEnvelope(envelope, 'boot-1')).toThrow(
        /volume/,
      );
    }
    envelope.payload.playback.volume = 0.42;
    envelope.payload.playback.muted = 'false';
    expect(() => parseOutputStreamEnvelope(envelope, 'boot-1')).toThrow(
      /muted/,
    );
  });
  it('uses an explicit browser-source subprotocol', () => {
    expect(OUTPUT_V3_SUBPROTOCOL).toBe('utawakui.output.v3');
  });

  it('canonicalizes bounded T2 lyric content without private fields', () => {
    const parsed = parseOutputStreamEnvelope(lyricsEnvelope(), 'boot-1');

    expect(parsed).toMatchObject({
      stream: 'lyrics.document',
      revision: 1,
      payload: {
        document: {
          documentId: 'lyrics-1',
          granularity: 'T2',
          lines: [
            {
              lineId: 'line-1',
              segments: [
                { segmentId: 'segment-1' },
                { segmentId: 'segment-2' },
              ],
            },
          ],
        },
      },
    });
    expect(parsed.payload.document.source).toEqual({ language: 'ja' });
  });

  it('canonicalizes aligned ruby readings with undetermined source metadata and rejects a stale line binding', () => {
    const baseDocument = lyricsEnvelope().payload.document;
    const withReading = lyricsEnvelope({
      payload: {
        document: {
          ...baseDocument,
          reading: {
            lines: [
              {
                lineId: 'line-1',
                text: '歌詞です',
                segments: [
                  { text: '歌詞', reading: 'かし', privateTag: 'hidden' },
                  { text: 'です' },
                ],
              },
            ],
          },
        },
      },
    });

    expect(
      parseOutputStreamEnvelope(withReading, 'boot-1').payload.document.reading,
    ).toEqual({
      lines: [
        {
          lineId: 'line-1',
          text: '歌詞です',
          segments: [{ text: '歌詞', reading: 'かし' }, { text: 'です' }],
        },
      ],
    });

    withReading.payload.document.source = { language: 'und' };
    expect(
      parseOutputStreamEnvelope(withReading, 'boot-1').payload.document.reading,
    ).toBeTruthy();

    withReading.payload.document.reading.lines[0].text = '古い歌詞';
    expect(() => parseOutputStreamEnvelope(withReading, 'boot-1')).toThrow(
      TypeError,
    );
  });

  it('rejects reading data on undetermined non-Japanese lyric text', () => {
    const baseDocument = lyricsEnvelope().payload.document;
    const value = lyricsEnvelope({
      payload: {
        document: {
          ...baseDocument,
          granularity: 'T0',
          source: { language: 'und' },
          lines: [
            {
              lineId: 'line-1',
              text: '你到底在選擇什麼',
              startMs: null,
              endMs: null,
            },
          ],
          reading: {
            lines: [
              {
                lineId: 'line-1',
                text: '你到底在選擇什麼',
                segments: [{ text: '你到底在選擇什麼', reading: 'reading' }],
              },
            ],
          },
        },
      },
    });

    expect(() => parseOutputStreamEnvelope(value, 'boot-1')).toThrow(
      'Japanese lyrics are required',
    );
  });

  it('preserves a validated next-line inferred lyric boundary', () => {
    const value = lyricsEnvelope({
      payload: {
        document: {
          ...lyricsEnvelope().payload.document,
          granularity: 'T1',
          lines: [
            {
              lineId: 'line-1',
              text: 'First',
              startMs: 1000,
              endMs: 3000,
              endInferred: true,
            },
            {
              lineId: 'line-2',
              text: 'Second',
              startMs: 3000,
              endMs: null,
            },
          ],
        },
      },
    });

    expect(
      parseOutputStreamEnvelope(value, 'boot-1').payload.document.lines[0],
    ).toMatchObject({ endMs: 3000, endInferred: true });
  });

  it('validates queue and dynamic state references independently', () => {
    expect(parseOutputStreamEnvelope(queueEnvelope(), 'boot-1')).toMatchObject({
      stream: 'queue.document',
      payload: { document: { documentId: 'queue-current' } },
    });
    expect(parseOutputStreamEnvelope(stateEnvelope(), 'boot-1')).toMatchObject({
      stream: 'state.snapshot',
      payload: {
        lyrics: { documentId: 'lyrics-1', documentRevision: 1 },
        queue: { documentId: 'queue-current', documentRevision: 1 },
        musicStructure: {
          documentId: `music-structure-${'a'.repeat(64)}`,
          documentRevision: 1,
        },
      },
    });
  });

  it('canonicalizes bounded immutable music-structure cues', () => {
    expect(
      parseOutputStreamEnvelope(musicStructureEnvelope(), 'boot-1'),
    ).toEqual(musicStructureEnvelope());
  });

  it.each([
    ['unknown stream', stateEnvelope({ stream: 'vendor.event' })],
    ['stale boot', stateEnvelope({ bootId: 'boot-old' })],
    ['missing epoch', stateEnvelope({ sourceEpoch: '' })],
    ['invalid revision', stateEnvelope({ revision: -1 })],
    [
      'invalid source revision',
      musicStructureEnvelope({
        payload: {
          document: {
            ...musicStructureEnvelope().payload.document,
            sourceRevision: '../audio.wav',
          },
        },
      }),
    ],
    [
      'document id from another source revision',
      musicStructureEnvelope({
        payload: {
          document: {
            ...musicStructureEnvelope().payload.document,
            documentId: `music-structure-${'b'.repeat(64)}`,
          },
        },
      }),
    ],
    [
      'low-confidence role with an executable field',
      musicStructureEnvelope({
        payload: {
          document: {
            ...musicStructureEnvelope().payload.document,
            sections: [
              {
                ...musicStructureEnvelope().payload.document.sections[0],
                selector: 'body > script',
              },
            ],
          },
        },
      }),
    ],
    [
      'non-boolean inferred lyric boundary',
      lyricsEnvelope({
        payload: {
          document: {
            ...lyricsEnvelope().payload.document,
            lines: [
              {
                ...lyricsEnvelope().payload.document.lines[0],
                endInferred: 'yes',
              },
            ],
          },
        },
      }),
    ],
    [
      'untimed inferred lyric boundary',
      lyricsEnvelope({
        payload: {
          document: {
            ...lyricsEnvelope().payload.document,
            granularity: 'T0',
            lines: [
              {
                lineId: 'line-1',
                text: 'First',
                startMs: null,
                endMs: null,
                endInferred: true,
              },
              {
                lineId: 'line-2',
                text: 'Second',
                startMs: null,
                endMs: null,
              },
            ],
          },
        },
      }),
    ],
    [
      'segment text mismatch',
      lyricsEnvelope({
        payload: {
          document: {
            ...lyricsEnvelope().payload.document,
            lines: [
              {
                ...lyricsEnvelope().payload.document.lines[0],
                text: 'different',
              },
            ],
          },
        },
      }),
    ],
    [
      'unknown line reference',
      stateEnvelope({
        payload: {
          ...stateEnvelope().payload,
          lyrics: {
            ...stateEnvelope().payload.lyrics,
            activeLineId: 42,
          },
        },
      }),
    ],
    [
      'nonzero revision without lyrics content',
      stateEnvelope({
        payload: {
          ...stateEnvelope().payload,
          lyrics: {
            documentId: null,
            documentRevision: 1,
            offsetMs: 0,
            activeLineId: null,
            activeSegmentId: null,
          },
        },
      }),
    ],
    [
      'active ids without lyrics content',
      stateEnvelope({
        payload: {
          ...stateEnvelope().payload,
          lyrics: {
            documentId: null,
            documentRevision: 0,
            offsetMs: 0,
            activeLineId: 'line-1',
            activeSegmentId: null,
          },
        },
      }),
    ],
    [
      'queue item without a track',
      queueEnvelope({
        payload: {
          document: {
            ...queueEnvelope().payload.document,
            items: [{ state: 'queued', track: null }],
          },
        },
      }),
    ],
  ])('rejects %s at the main-process boundary', (_label, value) => {
    expect(() => parseOutputStreamEnvelope(value, 'boot-1')).toThrow(TypeError);
  });
});

describe('snapshot-v2 compatibility assembly', () => {
  it('assembles canonical v2 output while leaving T2 segments in content', () => {
    const lyrics = parseOutputStreamEnvelope(lyricsEnvelope(), 'boot-1').payload
      .document;
    const queue = parseOutputStreamEnvelope(queueEnvelope(), 'boot-1').payload
      .document;
    const dynamic = parseOutputStreamEnvelope(
      stateEnvelope(),
      'boot-1',
    ).payload;

    expect(
      assembleOutputSnapshotV2({
        revision: 9,
        dynamic,
        lyricsDocument: lyrics,
        queueDocument: queue,
      }),
    ).toEqual({
      version: 2,
      revision: 9,
      generatedAt: '2026-08-23T00:00:00.000Z',
      displayDelayMs: 250,
      playback: dynamic.playback,
      queue: { sourceName: 'Tonight', items: queue.items },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'ja' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [{ text: '歌詞です', startMs: 1000, endMs: 3000 }],
      },
    });
  });

  it('fails closed when state references do not match supplied content', () => {
    const dynamic = parseOutputStreamEnvelope(
      stateEnvelope(),
      'boot-1',
    ).payload;
    expect(() =>
      assembleOutputSnapshotV2({
        revision: 1,
        dynamic,
        lyricsDocument: null,
        queueDocument: null,
      }),
    ).toThrow(TypeError);
  });

  it('assembles a valid empty lyrics view from a null content reference', () => {
    const queue = parseOutputStreamEnvelope(queueEnvelope(), 'boot-1').payload
      .document;
    const dynamic = parseOutputStreamEnvelope(
      stateEnvelope({
        payload: {
          ...stateEnvelope().payload,
          lyrics: {
            documentId: null,
            documentRevision: 0,
            offsetMs: -250,
            activeLineId: null,
            activeSegmentId: null,
          },
        },
      }),
      'boot-1',
    ).payload;

    expect(
      assembleOutputSnapshotV2({
        revision: 10,
        dynamic,
        lyricsDocument: null,
        queueDocument: queue,
      }),
    ).toMatchObject({
      revision: 10,
      lyrics: {
        trackId: null,
        synced: false,
        offsetMs: -250,
        activeLineIndex: -1,
        lines: [],
      },
    });
  });
});
