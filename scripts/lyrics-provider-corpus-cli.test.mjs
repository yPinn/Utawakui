import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseLyricsProviderCorpusCliArgs,
  runLyricsProviderCorpusCli,
} from './lyrics-provider-corpus-cli.mjs';
import { createDefaultLyricsProviderProbeRegistry } from './lyrics-provider-probe-registry.mjs';

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-lyrics-provider-cli-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function lrclibRecord(title, artist, album, id) {
  return {
    id,
    name: `${title} - ${artist}`,
    trackName: title,
    artistName: artist,
    albumName: album,
    duration: title.includes('One') ? 180 : 220,
    instrumental: false,
    plainLyrics: 'PRIVATE LRCLIB TEXT',
    syncedLyrics: '[00:01.00]PRIVATE LRCLIB TEXT',
    lyricsfile: null,
  };
}

function amllItem(title, artist, album, id, includeLyrics = false) {
  return {
    id,
    filename: `synthetic-${id}.ttml`,
    musicNames: [title],
    artistNames: [artist],
    albumNames: album ? [album] : [],
    ncmMusicIds: [],
    qqMusicIds: [],
    appleMusicIds: [],
    spotifyIds: [],
    isrcs: [],
    authorIds: ['42'],
    authorUsernames: ['synthetic-author'],
    format: 'ttml',
    ...(includeLyrics
      ? {
          lyrics:
            '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body dur="10s"><p begin="1s" end="3s"><span begin="1s" end="3s">PRIVATE AMLL TEXT</span></p></body></tt>',
        }
      : {}),
  };
}

function fixedProviderFetch() {
  return vi.fn(async (requestUrl) => {
    const url = new URL(requestUrl);
    if (url.origin === 'https://lrclib.net') {
      const title =
        url.searchParams.get('track_name') ||
        url.searchParams.get('q')?.split(' Synthetic Private Artist')[0] ||
        'Synthetic Private Title One';
      const first = title.includes('One');
      const record = lrclibRecord(
        title,
        first ? 'Synthetic Private Artist' : '合成私有歌手',
        first ? 'Synthetic Private Album' : null,
        first ? 101 : 102,
      );
      return new Response(
        JSON.stringify(url.pathname === '/api/get' ? record : [record]),
      );
    }
    if (url.origin === 'https://api.amll.dev') {
      const isSearch = url.pathname.endsWith('/search');
      const title = isSearch
        ? url.searchParams.get('musicName')
        : url.searchParams.get('id') === '201'
          ? 'Synthetic Private Title One'
          : '合成私有標題二';
      const first = title.includes('One');
      const item = amllItem(
        title,
        first ? 'Synthetic Private Artist' : '合成私有歌手',
        first ? 'Synthetic Private Album' : null,
        first ? 201 : 202,
        !isSearch,
      );
      const data = isSearch
        ? {
            items: [item],
            pagination: {
              page: 1,
              pageSize: 10,
              total: 1,
              totalPages: 1,
              hasMore: false,
            },
          }
        : item;
      return new Response(JSON.stringify({ status: 200, data }));
    }
    throw new Error('unexpected provider origin');
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('fixed lyrics provider corpus CLI arguments', () => {
  it('accepts only input, output, and the explicit synthetic mode', () => {
    expect(
      parseLyricsProviderCorpusCliArgs(['private.json', 'report.json']),
    ).toEqual({
      inputPath: path.resolve('private.json'),
      outputPath: path.resolve('report.json'),
      synthetic: false,
      requiredCaseCount: 40,
    });
    expect(
      parseLyricsProviderCorpusCliArgs([
        'synthetic.json',
        'report.json',
        '--synthetic',
      ]),
    ).toMatchObject({ synthetic: true, requiredCaseCount: 2 });
  });

  it.each([
    null,
    [],
    ['input.json'],
    ['', 'output.json'],
    ['input.json', 'output.json', '--provider-module', 'unsafe.mjs'],
    ['input.json', 'output.json', '--provider-url=https://example.invalid'],
    ['same.json', 'same.json'],
  ])('rejects unsafe or incomplete arguments %#', (args) => {
    expect(() => parseLyricsProviderCorpusCliArgs(args)).toThrow(
      /lyrics provider corpus CLI|must not overwrite/i,
    );
  });
});

describe('fixed lyrics provider corpus CLI', () => {
  it('constructs only the frozen LRCLIB/AMLL registry', () => {
    const registry = createDefaultLyricsProviderProbeRegistry();
    expect(Object.keys(registry)).toEqual(['lrclib', 'amll']);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('runs the synthetic corpus end to end without writing private references or lyrics', async () => {
    vi.stubGlobal('fetch', fixedProviderFetch());
    const directory = temporaryDirectory();
    const inputPath = path.join(directory, 'synthetic-corpus.json');
    const outputPath = path.join(directory, 'report.json');
    fs.copyFileSync(
      new URL(
        './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
        import.meta.url,
      ),
      inputPath,
    );

    await expect(
      runLyricsProviderCorpusCli([inputPath, outputPath, '--synthetic']),
    ).resolves.toBe(path.resolve(outputPath));

    const serialized = fs.readFileSync(outputPath, 'utf8');
    const result = JSON.parse(serialized);
    expect(result.run).toEqual({
      caseCount: 2,
      providerCount: 2,
      observationCount: 4,
    });
    expect(result.cases).toHaveLength(2);
    expect(serialized).not.toContain('Synthetic Private Title');
    expect(serialized).not.toContain('合成私有標題');
    expect(serialized).not.toContain('PRIVATE LRCLIB TEXT');
    expect(serialized).not.toContain('PRIVATE AMLL TEXT');
    expect(serialized).not.toContain('synthetic-201.ttml');

    await expect(
      runLyricsProviderCorpusCli([inputPath, outputPath, '--synthetic']),
    ).resolves.toBe(path.resolve(outputPath));
  });

  it('rejects a non-synthetic corpus in synthetic mode and bounded oversized input', async () => {
    const directory = temporaryDirectory();
    const outputPath = path.join(directory, 'report.json');
    const regularPath = path.join(directory, 'regular.json');
    const regular = JSON.parse(
      fs.readFileSync(
        new URL(
          './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    regular.corpusId = 'lyrics-provider-private-v1';
    fs.writeFileSync(regularPath, JSON.stringify(regular));
    await expect(
      runLyricsProviderCorpusCli([regularPath, outputPath, '--synthetic']),
    ).rejects.toThrow(/synthetic corpus id/i);

    const oversizedPath = path.join(directory, 'oversized.json');
    fs.writeFileSync(oversizedPath, 'x'.repeat(1024 * 1024 + 1));
    await expect(
      runLyricsProviderCorpusCli([oversizedPath, outputPath, '--synthetic']),
    ).rejects.toThrow(/size limit/i);
  });

  it('rejects an existing report path that aliases the input file', async () => {
    vi.stubGlobal('fetch', fixedProviderFetch());
    const directory = temporaryDirectory();
    const inputPath = path.join(directory, 'synthetic-corpus.json');
    const outputPath = path.join(directory, 'hard-linked-report.json');
    fs.copyFileSync(
      new URL(
        './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
        import.meta.url,
      ),
      inputPath,
    );
    fs.linkSync(inputPath, outputPath);

    await expect(
      runLyricsProviderCorpusCli([inputPath, outputPath, '--synthetic']),
    ).rejects.toThrow(/must not overwrite input/i);
  });

  it('does not print malformed private JSON content to stderr', () => {
    const directory = temporaryDirectory();
    const inputPath = path.join(directory, 'malformed-private.json');
    const outputPath = path.join(directory, 'report.json');
    const marker = 'PRIVATE SECRET TITLE';
    fs.writeFileSync(inputPath, `{ "corpusId": "${marker}"`);

    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/lyrics-provider-corpus-cli.mjs'),
        inputPath,
        outputPath,
        '--synthetic',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/private corpus JSON is invalid/i);
    expect(result.stderr).not.toContain(marker);
  });

  it('does not print private filesystem paths to stderr', () => {
    const directory = temporaryDirectory();
    const marker = 'PRIVATE-SECRET-PATH';
    const inputPath = path.join(directory, marker, 'missing.json');
    const outputPath = path.join(directory, 'report.json');

    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/lyrics-provider-corpus-cli.mjs'),
        inputPath,
        outputPath,
        '--synthetic',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/private corpus could not be read/i);
    expect(result.stderr).not.toContain(marker);
    expect(result.stderr).not.toContain(directory);
  });

  it('reads the private corpus through a bounded file descriptor', async () => {
    vi.stubGlobal('fetch', fixedProviderFetch());
    const directory = temporaryDirectory();
    const inputPath = path.join(directory, 'synthetic-corpus.json');
    const outputPath = path.join(directory, 'report.json');
    fs.copyFileSync(
      new URL(
        './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
        import.meta.url,
      ),
      inputPath,
    );
    const unboundedRead = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementation(() => {
        throw new Error('unbounded private corpus read was used');
      });

    await expect(
      runLyricsProviderCorpusCli([inputPath, outputPath, '--synthetic']),
    ).resolves.toBe(path.resolve(outputPath));
    expect(unboundedRead).not.toHaveBeenCalled();
  });

  it('removes a private report temporary file after a partial write failure', async () => {
    vi.stubGlobal('fetch', fixedProviderFetch());
    const directory = temporaryDirectory();
    const inputPath = path.join(directory, 'synthetic-corpus.json');
    const outputPath = path.join(directory, 'report.json');
    fs.copyFileSync(
      new URL(
        './fixtures/lyrics-provider-corpus/synthetic-two-case.json',
        import.meta.url,
      ),
      inputPath,
    );
    vi.spyOn(fs, 'writeSync').mockImplementationOnce(() => {
      throw new Error('simulated partial report write failure');
    });

    await expect(
      runLyricsProviderCorpusCli([inputPath, outputPath, '--synthetic']),
    ).rejects.toThrow(/report could not be written/i);
    expect(fs.readdirSync(directory)).toEqual(['synthetic-corpus.json']);
  });
});
