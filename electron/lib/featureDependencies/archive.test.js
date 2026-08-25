import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expandZipArchive, validateZipArchiveBuffer } from './archive.js';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data || '');
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function dependency() {
  return { id: 'archive-test', role: 'archive fixture' };
}

function createProcessDouble() {
  const proc = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateZipArchiveBuffer', () => {
  it('accepts bounded nested entries', () => {
    const archive = createStoredZip([
      { name: 'package/bin/tool.exe', data: 'exe' },
      { name: 'package/licenses/', data: '' },
    ]);

    expect(() =>
      validateZipArchiveBuffer(archive, 'C:\\managed\\tool', dependency()),
    ).not.toThrow();
  });

  it.each([
    '',
    '../escape.txt',
    'package/../../escape.txt',
    '..\\escape.txt',
    '/absolute.txt',
    'C:\\absolute.txt',
  ])('rejects unsafe entry name %j', (name) => {
    const archive = createStoredZip([{ name, data: 'unsafe' }]);

    expect(() =>
      validateZipArchiveBuffer(archive, 'C:\\managed\\tool', dependency()),
    ).toThrow(/outside the destination/);
  });

  it('rejects archives without a valid end-of-central-directory record', () => {
    expect(() =>
      validateZipArchiveBuffer(Buffer.alloc(40), '/managed/tool', dependency()),
    ).toThrow(/Invalid feature dependency archive/);
  });

  it.each(['bounds', 'short-entry', 'signature', 'filename'])(
    'rejects malformed central directory %s',
    (failure) => {
      const archive = createStoredZip([{ name: 'tool.exe', data: 'exe' }]);
      const eocdOffset = archive.length - 22;
      const centralOffset = archive.readUInt32LE(eocdOffset + 16);

      if (failure === 'bounds') {
        archive.writeUInt32LE(archive.length, eocdOffset + 16);
      } else if (failure === 'short-entry') {
        archive.writeUInt32LE(10, eocdOffset + 12);
      } else if (failure === 'signature') {
        archive.writeUInt32LE(0, centralOffset);
      } else {
        archive.writeUInt16LE(0xffff, centralOffset + 28);
      }

      expect(() =>
        validateZipArchiveBuffer(archive, '/managed/tool', dependency()),
      ).toThrow(/Invalid feature dependency archive/);
    },
  );
});

describe('expandZipArchive', () => {
  it('passes paths as named PowerShell parameters and resolves on success', async () => {
    const proc = createProcessDouble();
    const spawnImpl = vi.fn(() => proc);
    const pending = expandZipArchive(
      'C:\\cache\\tool.zip',
      'C:\\managed\\tool',
      dependency(),
      { spawnImpl },
    );

    proc.emit('close', 0);
    await expect(pending).resolves.toBeUndefined();

    const [command, args] = spawnImpl.mock.calls[0];
    expect(path.basename(command).toLowerCase()).toBe('powershell.exe');
    expect(args).toContain('-NoProfile');
    expect(args[args.indexOf('-Command') + 1]).toContain(
      'param([string]$ArchivePath, [string]$DestinationPath)',
    );
    expect(args.at(-2)).toBe('C:\\cache\\tool.zip');
    expect(args.at(-1)).toBe('C:\\managed\\tool');
  });

  it('uses the Windows PowerShell executable when it exists', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const proc = createProcessDouble();
    const spawnImpl = vi.fn(() => proc);
    const pending = expandZipArchive(
      'archive.zip',
      'destination',
      dependency(),
      {
        spawnImpl,
      },
    );

    proc.emit('close', 0);
    await pending;

    expect(spawnImpl.mock.calls[0][0]).toContain(
      path.join('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    );
  });

  it('rejects non-zero exits with captured stderr', async () => {
    const proc = createProcessDouble();
    const pending = expandZipArchive(
      'archive.zip',
      'destination',
      dependency(),
      {
        spawnImpl: () => proc,
      },
    );

    proc.stderr.emit('data', Buffer.from('access denied'));
    proc.emit('close', 7);

    await expect(pending).rejects.toThrow(
      /failed to extract feature dependency archive \(code 7\): access denied/,
    );
  });

  it('rejects process spawn failures', async () => {
    const proc = createProcessDouble();
    const pending = expandZipArchive(
      'archive.zip',
      'destination',
      dependency(),
      {
        spawnImpl: () => proc,
      },
    );
    const failure = new Error('spawn failed');

    proc.emit('error', failure);

    await expect(pending).rejects.toBe(failure);
  });
});
