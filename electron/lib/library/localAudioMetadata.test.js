import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  classifyParsedAudioMetadata,
  LocalAudioMetadataError,
  normalizeParsedAudioMetadata,
  readLocalAudioMetadata,
} from './localAudioMetadata.js';

function riffChunk(id, payload) {
  const padding = payload.length % 2 === 0 ? Buffer.alloc(0) : Buffer.alloc(1);
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, padding]);
}

function infoField(id, value) {
  return riffChunk(id, Buffer.from(`${value}\0`, 'utf8'));
}

function pcmWaveBuffer({ duration = 1, withTags = false } = {}) {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.round(sampleRate * duration);
  const blockAlign = (channels * bitsPerSample) / 8;
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(channels, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * blockAlign, 8);
  format.writeUInt16LE(blockAlign, 12);
  format.writeUInt16LE(bitsPerSample, 14);

  const chunks = [riffChunk('fmt ', format)];
  if (withTags) {
    chunks.push(
      riffChunk(
        'LIST',
        Buffer.concat([
          Buffer.from('INFO', 'ascii'),
          infoField('INAM', 'Tagged title'),
          infoField('IART', 'Tagged artist'),
          infoField('IPRD', 'Tagged album'),
          infoField('ICRD', '2024'),
        ]),
      ),
    );
  }
  chunks.push(riffChunk('data', Buffer.alloc(sampleCount * blockAlign)));

  const payload = Buffer.concat([Buffer.from('WAVE', 'ascii'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function adtsAacBuffer(frameCount = 20) {
  const frameLength = 32;
  const header = Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x04, 0x1f, 0xfc]);
  const frame = Buffer.concat([
    header,
    Buffer.alloc(frameLength - header.length),
  ]);
  return Buffer.concat(Array.from({ length: frameCount }, () => frame));
}

function pngHeader(width = 64, height = 64) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 4, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('local audio metadata', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-audio-meta-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(['.wav', '.wave', '.bwf'])(
    'reads duration and common RIFF tags from a real local %s file',
    async (extension) => {
      const filePath = path.join(dir, `tagged${extension}`);
      fs.writeFileSync(
        filePath,
        pcmWaveBuffer({ duration: 1, withTags: true }),
      );

      const metadata = await readLocalAudioMetadata(filePath, extension);

      expect(metadata).toMatchObject({
        duration: 1,
        title: 'Tagged title',
        artist: 'Tagged artist',
        album: 'Tagged album',
        releaseYear: 2024,
      });
    },
  );

  it.each(['.aac', '.adts'])(
    'reads a real ADTS/AAC stream selected with the %s extension',
    async (extension) => {
      const filePath = path.join(dir, `sample${extension}`);
      fs.writeFileSync(filePath, adtsAacBuffer());

      const metadata = await readLocalAudioMetadata(filePath, extension);

      expect(metadata.duration).toBeGreaterThan(0);
    },
  );

  it('rejects a corrupt file even when it has an allowlisted extension', async () => {
    const filePath = path.join(dir, 'not-really-audio.mp3');
    fs.writeFileSync(filePath, 'not audio');

    await expect(
      readLocalAudioMetadata(filePath, '.mp3'),
    ).rejects.toMatchObject({
      name: 'LocalAudioMetadataError',
      code: 'invalid-audio',
    });
  });

  it('rejects audio bytes that do not match the selected extension', async () => {
    const filePath = path.join(dir, 'renamed.mp3');
    fs.writeFileSync(filePath, pcmWaveBuffer());

    await expect(
      readLocalAudioMetadata(filePath, '.mp3'),
    ).rejects.toMatchObject({
      name: 'LocalAudioMetadataError',
      code: 'invalid-audio',
    });
  });

  it('rejects a parsed container that conflicts with the selected extension', () => {
    expect(() =>
      normalizeParsedAudioMetadata(
        {
          format: { container: 'WAVE', codec: 'PCM', duration: 1 },
          common: {},
        },
        '.mp3',
      ),
    ).toThrow(expect.objectContaining({ code: 'format-mismatch' }));
  });

  it.each([
    ['.aac', 'ADTS/MPEG-4', 'AAC'],
    ['.adts', 'ADTS/MPEG-2', 'AAC'],
    ['.bwf', 'WAVE', 'PCM'],
    ['.flac', 'FLAC', 'FLAC'],
    ['.m4a', 'M4A/MP4', 'MPEG-4/AAC'],
    ['.mp3', 'MPEG', 'MPEG 1 Layer 3'],
    ['.oga', 'Ogg', 'Vorbis I'],
    ['.ogg', 'Ogg', 'Opus'],
    ['.opus', 'Ogg', 'Opus'],
    ['.wav', 'WAVE', 'IEEE_FLOAT'],
    ['.wave', 'WAVE', 'MULAW'],
    ['.webm', 'EBML/webm', 'VORBIS'],
  ])(
    'accepts the detected container and codec for %s',
    (extension, container, codec) => {
      expect(
        normalizeParsedAudioMetadata(
          { format: { container, codec, duration: 1 } },
          extension,
        ),
      ).toEqual({ duration: 1 });
    },
  );

  it('rejects a generic Matroska container renamed to .webm', () => {
    expect(() =>
      normalizeParsedAudioMetadata(
        {
          format: { container: 'EBML/matroska', codec: 'Opus', duration: 1 },
          common: {},
        },
        '.webm',
      ),
    ).toThrow(expect.objectContaining({ code: 'format-mismatch' }));
  });

  it.each([
    ['.ogg', 'Ogg', 'Speex 1.2'],
    ['.opus', 'Ogg', 'Vorbis I'],
    ['.wav', 'WAVE', 'DOLBY_AC3_SPDIF'],
    ['.webm', 'EBML/webm', 'FLAC'],
  ])(
    'rejects an unsupported codec inside an otherwise valid %s container',
    (extension, container, codec) => {
      expect(() =>
        normalizeParsedAudioMetadata(
          { format: { container, codec, duration: 1 } },
          extension,
        ),
      ).toThrow(expect.objectContaining({ code: 'unsupported-codec' }));
    },
  );

  it.each([
    ['.wma', 'ASF/audio', 'Windows Media Audio 9.2', 'wma'],
    ['.aif', 'AIFF', 'PCM', 'aiff'],
    ['.aifc', 'AIFF-C', 'PCM (byte swapped)', 'aiff'],
    ['.aiff', 'AIFF', 'PCM', 'aiff'],
    ['.m4a', 'M4A/MP4', 'ALAC', 'alac'],
    ['.ape', "Monkey's Audio", "Monkey's Audio", 'ape'],
    ['.wv', 'WavPack', 'PCM', 'wavpack'],
    ['.caf', 'CAF', 'PCM', 'caf'],
    ['.caf', 'CAF', 'ALAC', 'caf'],
  ])(
    'classifies %s %s/%s as a bounded %s conversion source',
    (extension, container, codec, sourceFormat) => {
      expect(
        classifyParsedAudioMetadata(
          {
            format: {
              container,
              codec,
              duration: 12.5,
              hasAudio: true,
              hasVideo: false,
            },
            common: { title: 'Source title' },
          },
          extension,
        ),
      ).toEqual({
        kind: 'conversion',
        sourceFormat,
        metadata: { duration: 12.5, title: 'Source title' },
      });
    },
  );

  it('classifies existing playable formats as direct without changing metadata', () => {
    expect(
      classifyParsedAudioMetadata(
        {
          format: { container: 'FLAC', codec: 'FLAC', duration: 2 },
          common: { artist: 'Artist' },
        },
        '.flac',
      ),
    ).toEqual({
      kind: 'direct',
      metadata: { duration: 2, artist: 'Artist' },
    });
  });

  it.each([
    ['.wma', 'AIFF', 'PCM', 'format-mismatch'],
    ['.caf', 'CAF', 'private-codec', 'unsupported-codec'],
    ['.wv', 'WavPack', 'DSD', 'unsupported-codec'],
  ])(
    'does not offer conversion for mismatched or unapproved %s media',
    (extension, container, codec, code) => {
      expect(() =>
        classifyParsedAudioMetadata(
          {
            format: { container, codec, duration: 1, hasAudio: true },
          },
          extension,
        ),
      ).toThrow(expect.objectContaining({ code }));
    },
  );

  it('rejects video-bearing ASF instead of offering WMA conversion', () => {
    expect(() =>
      classifyParsedAudioMetadata(
        {
          format: {
            container: 'ASF/audio',
            codec: 'Windows Media Audio',
            duration: 1,
            hasAudio: true,
            hasVideo: true,
          },
        },
        '.wma',
      ),
    ).toThrow(expect.objectContaining({ code: 'unsupported-media' }));
  });

  it('turns M4A/ALAC into conversion-required on the direct reader contract', () => {
    expect(() =>
      normalizeParsedAudioMetadata(
        {
          format: { container: 'M4A/MP4', codec: 'ALAC', duration: 1 },
        },
        '.m4a',
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'conversion-required',
        sourceFormat: 'alac',
      }),
    );
  });

  it.each(['.m4a', '.ogg', '.webm'])(
    'rejects video-bearing media selected through the %s audio import path',
    (extension) => {
      const formatByExtension = {
        '.m4a': { container: 'M4A/MP4', codec: 'MPEG-4/AAC' },
        '.ogg': { container: 'Ogg', codec: 'Opus' },
        '.webm': { container: 'EBML/webm', codec: 'OPUS' },
      };

      expect(() =>
        normalizeParsedAudioMetadata(
          {
            format: {
              ...formatByExtension[extension],
              duration: 1,
              hasAudio: true,
              hasVideo: true,
            },
          },
          extension,
        ),
      ).toThrow(expect.objectContaining({ code: 'unsupported-media' }));
    },
  );

  it('omits invalid optional tags and unusable artwork', () => {
    expect(
      normalizeParsedAudioMetadata(
        {
          format: { container: 'WAVE', codec: 'PCM', duration: 1 },
          common: {
            title: null,
            artist: null,
            album: null,
            year: 99,
            picture: [{ data: Symbol('invalid') }, { data: Buffer.alloc(0) }],
          },
        },
        '.wav',
      ),
    ).toEqual({ duration: 1 });
  });

  it('bounds text, keeps useful scalar fields, and accepts only validated embedded artwork', () => {
    const artwork = pngHeader();
    const normalized = normalizeParsedAudioMetadata(
      {
        format: { container: 'WAVE', codec: 'PCM', duration: 90.25 },
        common: {
          title: `  ${'T'.repeat(600)}  `,
          artists: ['First artist', 'Second artist'],
          album: '  Album  ',
          year: 2023,
          picture: [
            { format: 'image/png', data: Buffer.from('invalid') },
            { format: 'image/png', data: artwork },
          ],
        },
      },
      '.wav',
    );

    expect(normalized.title).toHaveLength(500);
    expect(normalized).toMatchObject({
      artist: 'First artist, Second artist',
      album: 'Album',
      releaseYear: 2023,
      duration: 90.25,
      artwork: { extension: '.png', buffer: artwork },
    });
  });

  it('exposes bounded reason codes without copying parser messages', () => {
    const privateError = new Error('C:\\Users\\Singer\\private.mp3');
    const error = new LocalAudioMetadataError('invalid-audio', privateError);

    expect(error.code).toBe('invalid-audio');
    expect(error.message).toBe('Local audio metadata could not be read');
    expect(error.cause).toBe(privateError);
  });

  it.each([
    ['format-mismatch', 'Local audio format does not match its extension'],
    ['unsupported-codec', 'Local audio codec is not supported'],
    ['unsupported-media', 'Local media contains unsupported streams'],
    ['conversion-required', 'Local audio requires compatibility conversion'],
  ])('keeps the %s error message bounded', (code, message) => {
    expect(
      new LocalAudioMetadataError(code, new Error('private')).message,
    ).toBe(message);
  });
});
