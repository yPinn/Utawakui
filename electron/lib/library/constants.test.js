import { describe, expect, it } from 'vitest';
import {
  AUDIO_CONVERSION_EXTENSIONS,
  AUDIO_CONVERSION_FORMATS,
  AUDIO_EXTENSIONS,
  AUDIO_FORMATS,
  AUDIO_MIME_TYPES,
  AUDIO_PICKER_EXTENSIONS,
} from './constants.js';

describe('direct local audio format registry', () => {
  const expectedFormats = {
    '.aac': { family: 'adts-aac', mimeType: 'audio/aac' },
    '.adts': { family: 'adts-aac', mimeType: 'audio/aac' },
    '.bwf': { family: 'wave', mimeType: 'audio/wav' },
    '.flac': { family: 'flac', mimeType: 'audio/flac' },
    '.m4a': { family: 'mp4-aac', mimeType: 'audio/mp4' },
    '.mp3': { family: 'mp3', mimeType: 'audio/mpeg' },
    '.oga': { family: 'ogg-audio', mimeType: 'audio/ogg' },
    '.ogg': { family: 'ogg-audio', mimeType: 'audio/ogg' },
    '.opus': { family: 'ogg-opus', mimeType: 'audio/ogg' },
    '.wav': { family: 'wave', mimeType: 'audio/wav' },
    '.wave': { family: 'wave', mimeType: 'audio/wav' },
    '.webm': { family: 'webm-audio', mimeType: 'audio/webm' },
  };

  it('defines the stable Electron-playable extension, container family, and MIME contract once', () => {
    expect(AUDIO_FORMATS).toEqual(expectedFormats);
  });

  it('derives filesystem, picker, and media-serving allowlists from the same registry', () => {
    const extensions = Object.keys(expectedFormats);

    expect([...AUDIO_EXTENSIONS]).toEqual(extensions);
    expect(AUDIO_PICKER_EXTENSIONS).toEqual([
      ...extensions.map((extension) => extension.slice(1)),
      ...Object.keys(AUDIO_CONVERSION_FORMATS).map((extension) =>
        extension.slice(1),
      ),
    ]);
    expect(AUDIO_MIME_TYPES).toEqual(
      Object.fromEntries(
        Object.entries(expectedFormats).map(([extension, format]) => [
          extension,
          format.mimeType,
        ]),
      ),
    );
  });

  it('keeps recognized conversion sources separate from direct-play media', () => {
    expect(AUDIO_CONVERSION_FORMATS).toEqual({
      '.aif': { family: 'aiff', sourceFormat: 'aiff', label: 'AIFF' },
      '.aifc': { family: 'aiff', sourceFormat: 'aiff', label: 'AIFF-C' },
      '.aiff': { family: 'aiff', sourceFormat: 'aiff', label: 'AIFF' },
      '.ape': {
        family: 'monkeys-audio',
        sourceFormat: 'ape',
        label: "Monkey's Audio",
      },
      '.caf': { family: 'caf', sourceFormat: 'caf', label: 'CAF' },
      '.wma': { family: 'asf-wma', sourceFormat: 'wma', label: 'WMA' },
      '.wv': {
        family: 'wavpack',
        sourceFormat: 'wavpack',
        label: 'WavPack',
      },
    });
    expect([...AUDIO_CONVERSION_EXTENSIONS]).toEqual(
      Object.keys(AUDIO_CONVERSION_FORMATS),
    );
    for (const extension of AUDIO_CONVERSION_EXTENSIONS) {
      expect(AUDIO_EXTENSIONS.has(extension)).toBe(false);
      expect(AUDIO_MIME_TYPES).not.toHaveProperty(extension);
    }
  });
});
