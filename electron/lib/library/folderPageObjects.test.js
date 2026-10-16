import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import folderPageObjects from './folderPageObjects.js';

const {
  FOLDER_PAGE_OBJECTS_FILENAME,
  FOLDER_PAGE_USER_OBJECT_LIMIT,
  MAX_NOTE_TEXT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_PHOTO_CAPTION_LENGTH,
  MAX_PHOTO_LABEL_LENGTH,
  NOTE_PAPERS,
  PHOTO_FRAMES,
  PHOTO_RATIOS,
  addFolderPageNote,
  addFolderPagePhoto,
  buildFolderPageAssetUrl,
  deleteFolderPageObjects,
  listFolderPageObjects,
  removeFolderPageObject,
  resolveFolderPageAssetPath,
  saveFolderPageLayout,
  updateFolderPageNote,
  updateFolderPagePhotoText,
  validateFolderPageIdentity,
} = folderPageObjects;

const PHOTO_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_PHOTO_ID = '22222222-2222-4222-8222-222222222222';

function pngHeader(width = 640, height = 480) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegHeader(width = 640, height = 480) {
  const buffer = Buffer.alloc(20);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer[3] = 0xc0;
  buffer.writeUInt16BE(11, 4);
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

function webpHeader(width = 640, height = 480) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  buffer[24] = encodedWidth & 0xff;
  buffer[25] = (encodedWidth >> 8) & 0xff;
  buffer[26] = (encodedWidth >> 16) & 0xff;
  buffer[27] = encodedHeight & 0xff;
  buffer[28] = (encodedHeight >> 8) & 0xff;
  buffer[29] = (encodedHeight >> 16) & 0xff;
  return buffer;
}

function readManifest(directory) {
  return JSON.parse(
    fs.readFileSync(path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME), 'utf8'),
  );
}

function summaryEntry(overrides = {}) {
  return {
    key: 'derived:artist-summary',
    type: 'note',
    placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
    pinned: false,
    rotation: -1.5,
    order: 1,
    ...overrides,
  };
}

describe('folder page objects', () => {
  let directory;
  let sourcePath;
  const page = { kind: 'playlist', id: 'playlist-1' };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-folder-'));
    sourcePath = path.join(directory, 'picked-file-with-private-name.png');
    fs.writeFileSync(sourcePath, pngHeader());
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('accepts only bounded playlist, album, and artist identities', () => {
    expect(validateFolderPageIdentity(page)).toEqual(page);
    expect(
      validateFolderPageIdentity({ kind: 'album', id: 'album-1' }),
    ).toEqual({ kind: 'album', id: 'album-1' });
    expect(
      validateFolderPageIdentity({ kind: 'artist', id: 'artist-1' }),
    ).toEqual({ kind: 'artist', id: 'artist-1' });
    expect(validateFolderPageIdentity({ kind: 'library', id: 'x' })).toBe(null);
    expect(validateFolderPageIdentity({ kind: 'playlist', id: '../x' })).toBe(
      null,
    );
    expect(validateFolderPageIdentity({ kind: 'playlist', id: '' })).toBe(null);
  });

  it('copies a photo under an opaque id and persists no source path or URL', () => {
    const randomValues = [0, 1, 0, 0.9];
    const photo = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
      now: new Date('2026-10-10T01:00:00.000Z'),
      random: () => randomValues.shift(),
    });

    expect(photo).toEqual({
      key: `photo:${PHOTO_ID}`,
      type: 'photo',
      source: 'user',
      page,
      placement: { region: 'bottom', anchor: { x: 0.06, y: 0.19 } },
      pinned: false,
      rotation: -0.75,
      order: 1,
      createdAt: '2026-10-10T01:00:00.000Z',
      imageUrl: `utawakui-media://folder-asset/${PHOTO_ID}/image.png`,
      frame: 'instant',
      ratio: 'landscape',
      label: '',
      caption: '',
    });
    expect(listFolderPageObjects(directory, page)).toEqual([photo]);

    const manifest = fs.readFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      'utf8',
    );
    expect(manifest).not.toContain(sourcePath);
    expect(manifest).not.toContain('utawakui-media:');
    expect(manifest).not.toContain('picked-file-with-private-name');
    expect(
      fs.existsSync(
        path.join(directory, 'folder-page-assets', PHOTO_ID, 'image.png'),
      ),
    ).toBe(true);
  });

  it('places new user objects on bottom-region grid slots ahead of every existing object', () => {
    saveFolderPageLayout(directory, page, [summaryEntry()]);
    const photos = Array.from({ length: 5 }, (_, index) =>
      addFolderPagePhoto(directory, page, sourcePath, {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        random: () => 0.5,
      }),
    );

    expect(photos.map((photo) => photo.placement)).toEqual([
      { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
      { region: 'bottom', anchor: { x: 0.37, y: 0.15 } },
      { region: 'bottom', anchor: { x: 0.63, y: 0.15 } },
      { region: 'bottom', anchor: { x: 0.9, y: 0.15 } },
      { region: 'bottom', anchor: { x: 0.1, y: 0.5 } },
    ]);
    expect(photos.every((photo) => photo.rotation === 0.75)).toBe(true);
    expect(photos.map((photo) => photo.order)).toEqual([2, 3, 4, 5, 6]);
  });

  it('rejects oversized, invalid, and unsafe source files before copying', () => {
    fs.writeFileSync(sourcePath, Buffer.from('not-an-image'));
    expect(() => addFolderPagePhoto(directory, page, sourcePath)).toThrow(
      /valid image/i,
    );

    fs.writeFileSync(sourcePath, pngHeader(20_000, 20_000));
    expect(() => addFolderPagePhoto(directory, page, sourcePath)).toThrow(
      /dimensions/i,
    );

    fs.truncateSync(sourcePath, 10 * 1024 * 1024 + 1);
    expect(() => addFolderPagePhoto(directory, page, sourcePath)).toThrow(
      /10 MiB/i,
    );
    expect(fs.existsSync(path.join(directory, 'folder-page-assets'))).toBe(
      false,
    );
  });

  it('rechecks the actual bytes after reading a selected image', () => {
    fs.writeFileSync(
      sourcePath,
      Buffer.concat([pngHeader(), Buffer.alloc(10 * 1024 * 1024)]),
    );
    const stat = vi.spyOn(fs, 'statSync').mockReturnValueOnce({
      isFile: () => true,
      size: pngHeader().length,
    });

    expect(() => addFolderPagePhoto(directory, page, sourcePath)).toThrow(
      /10 MiB/i,
    );
    stat.mockRestore();
  });

  it('derives JPEG and WebP storage extensions from image magic', () => {
    fs.writeFileSync(sourcePath, jpegHeader());
    const jpeg = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
    });
    expect(jpeg.imageUrl).toMatch(/\/image\.jpg$/u);

    fs.writeFileSync(sourcePath, webpHeader());
    const webp = addFolderPagePhoto(directory, page, sourcePath, {
      id: SECOND_PHOTO_ID,
    });
    expect(webp.imageUrl).toMatch(/\/image\.webp$/u);
  });

  it('caps user objects per page while derived objects and other pages stay unaffected', () => {
    saveFolderPageLayout(directory, page, [summaryEntry()]);
    for (let index = 0; index < FOLDER_PAGE_USER_OBJECT_LIMIT; index += 1) {
      addFolderPagePhoto(directory, page, sourcePath, {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      });
    }
    expect(FOLDER_PAGE_USER_OBJECT_LIMIT).toBe(12);
    expect(() => addFolderPagePhoto(directory, page, sourcePath)).toThrow(
      expect.objectContaining({ code: 'FOLDER_PAGE_OBJECT_LIMIT_REACHED' }),
    );
    expect(() =>
      addFolderPagePhoto(
        directory,
        { kind: 'playlist', id: 'playlist-2' },
        sourcePath,
      ),
    ).not.toThrow();
  });

  it('saves one batch of placements, pins, and orders and rebases the page order', () => {
    addFolderPagePhoto(directory, page, sourcePath, { id: PHOTO_ID });
    addFolderPagePhoto(directory, page, sourcePath, { id: SECOND_PHOTO_ID });

    const objects = saveFolderPageLayout(directory, page, [
      {
        key: `photo:${SECOND_PHOTO_ID}`,
        placement: { region: 'paper', anchor: { x: 0.4, y: 0.6 } },
        pinned: true,
        order: 1,
      },
      summaryEntry({ order: 2 }),
      {
        key: `photo:${PHOTO_ID}`,
        placement: { region: 'side', anchor: { x: 0.5, y: 0.2 } },
        pinned: false,
        order: 30,
      },
    ]);

    expect(objects.map((object) => [object.key, object.order])).toEqual([
      [`photo:${SECOND_PHOTO_ID}`, 1],
      ['derived:artist-summary', 2],
      [`photo:${PHOTO_ID}`, 3],
    ]);
    expect(objects[0]).toMatchObject({
      placement: { region: 'paper', anchor: { x: 0.4, y: 0.6 } },
      pinned: true,
    });
    expect(objects[1]).toMatchObject({
      type: 'note',
      source: 'derived',
      rotation: -1.5,
    });
    expect(listFolderPageObjects(directory, page)).toEqual(objects);
  });

  it('keeps main-owned rotation for user objects and type for existing derived objects', () => {
    const photo = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
      random: () => 0,
    });
    saveFolderPageLayout(directory, page, [summaryEntry()]);

    const [summary, saved] = saveFolderPageLayout(directory, page, [
      {
        key: photo.key,
        placement: photo.placement,
        pinned: false,
        rotation: 4,
        order: 2,
      },
      summaryEntry({ rotation: 3, type: 'note' }),
    ]);

    expect(saved.rotation).toBe(-0.75);
    expect(summary.rotation).toBe(-1.5);
  });

  it('rejects an invalid batch without writing any entry', () => {
    addFolderPagePhoto(directory, page, sourcePath, { id: PHOTO_ID });
    const before = readManifest(directory);
    const valid = {
      key: `photo:${PHOTO_ID}`,
      placement: { region: 'paper', anchor: { x: 0.5, y: 0.5 } },
      pinned: true,
      order: 1,
    };
    const invalidBatches = [
      [
        valid,
        {
          ...valid,
          placement: { region: 'header', anchor: valid.placement.anchor },
        },
      ],
      [
        valid,
        { ...valid, placement: { region: 'paper', anchor: { x: 2, y: 0 } } },
      ],
      [valid, { ...valid, order: 0 }],
      [valid, { ...valid, pinned: 'yes' }],
      [valid, valid],
      [valid, { ...valid, key: `photo:${SECOND_PHOTO_ID}` }],
      [valid, summaryEntry({ type: 'photo' })],
      [valid, summaryEntry({ type: 'pdf' })],
      [valid, summaryEntry({ rotation: 9 })],
      [valid, summaryEntry({ key: 'derived:Bad Key' })],
      [valid, summaryEntry({ key: 'note:not-a-uuid' })],
      [],
    ];

    for (const batch of invalidBatches) {
      expect(() => saveFolderPageLayout(directory, page, batch)).toThrow();
    }
    expect(readManifest(directory)).toEqual(before);
  });

  it('removes user objects, keeps derived ones, cascades a page, and fails closed in the resolver', () => {
    const first = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
    });
    saveFolderPageLayout(directory, page, [summaryEntry()]);
    const otherPage = { kind: 'artist', id: 'artist-0123456789abcdef' };
    const second = addFolderPagePhoto(directory, otherPage, sourcePath, {
      id: SECOND_PHOTO_ID,
    });
    saveFolderPageLayout(directory, otherPage, [summaryEntry()]);

    expect(resolveFolderPageAssetPath(directory, PHOTO_ID, 'wrong.png')).toBe(
      null,
    );
    expect(
      resolveFolderPageAssetPath(directory, PHOTO_ID, 'image.png'),
    ).toBeTruthy();
    expect(removeFolderPageObject(directory, otherPage, first.key)).toBe(false);
    expect(
      removeFolderPageObject(directory, page, 'derived:artist-summary'),
    ).toBe(false);
    expect(removeFolderPageObject(directory, page, first.key)).toBe(true);
    expect(resolveFolderPageAssetPath(directory, PHOTO_ID, 'image.png')).toBe(
      null,
    );
    expect(
      fs.existsSync(path.join(directory, 'folder-page-assets', PHOTO_ID)),
    ).toBe(false);
    expect(
      listFolderPageObjects(directory, page).map((object) => object.key),
    ).toEqual(['derived:artist-summary']);

    expect(deleteFolderPageObjects(directory, otherPage)).toBe(2);
    expect(listFolderPageObjects(directory, otherPage)).toEqual([]);
    expect(
      resolveFolderPageAssetPath(directory, second.key.slice(6), 'image.png'),
    ).toBe(null);
  });

  it('migrates a version three manifest into one ordered object collection', () => {
    fs.mkdirSync(path.join(directory, 'folder-page-assets', PHOTO_ID), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(directory, 'folder-page-assets', PHOTO_ID, 'image.png'),
      pngHeader(),
    );
    fs.mkdirSync(path.join(directory, 'folder-page-assets', SECOND_PHOTO_ID), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(directory, 'folder-page-assets', SECOND_PHOTO_ID, 'image.png'),
      pngHeader(),
    );
    const createdAt = '2026-10-09T01:00:00.000Z';
    fs.writeFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      JSON.stringify({
        version: 3,
        assets: [
          {
            id: PHOTO_ID,
            page,
            imageFilename: 'image.png',
            anchor: { x: 0.2, y: 0.3 },
            rotation: 1.75,
            pinPlacement: null,
            pinned: false,
            order: 1,
            createdAt,
          },
          {
            id: SECOND_PHOTO_ID,
            page,
            imageFilename: 'image.png',
            anchor: { x: 0.9, y: 0.9 },
            rotation: -1.75,
            pinPlacement: { region: 'side', anchor: { x: 0.5, y: 0.1 } },
            pinned: true,
            order: 2,
            createdAt,
          },
        ],
        layouts: [
          {
            page,
            key: 'artist-summary',
            anchor: { x: 0.12, y: 0.78 },
            pinPlacement: null,
            pinned: false,
            order: 2,
          },
        ],
      }),
    );

    expect(
      listFolderPageObjects(directory, page).map((object) => ({
        key: object.key,
        type: object.type,
        source: object.source,
        placement: object.placement,
        pinned: object.pinned,
        rotation: object.rotation,
        order: object.order,
      })),
    ).toEqual([
      {
        key: `photo:${PHOTO_ID}`,
        type: 'photo',
        source: 'user',
        placement: { region: 'paper', anchor: { x: 0.2, y: 0.3 } },
        pinned: false,
        rotation: 1.75,
        order: 1,
      },
      {
        key: 'derived:artist-summary',
        type: 'note',
        source: 'derived',
        placement: { region: 'paper', anchor: { x: 0.12, y: 0.78 } },
        pinned: false,
        rotation: 0,
        order: 2,
      },
      {
        key: `photo:${SECOND_PHOTO_ID}`,
        type: 'photo',
        source: 'user',
        placement: { region: 'side', anchor: { x: 0.5, y: 0.1 } },
        pinned: true,
        rotation: -1.75,
        order: 3,
      },
    ]);
    const manifest = readManifest(directory);
    expect(manifest.version).toBe(4);
    expect(manifest).not.toHaveProperty('assets');
    expect(manifest).not.toHaveProperty('layouts');
  });

  it('reconciles missing photo files and corrupted manifests without breaking the page', () => {
    addFolderPagePhoto(directory, page, sourcePath, { id: PHOTO_ID });
    fs.rmSync(
      path.join(directory, 'folder-page-assets', PHOTO_ID, 'image.png'),
    );
    expect(listFolderPageObjects(directory, page)).toEqual([]);

    fs.writeFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      '{not-json',
    );
    expect(listFolderPageObjects(directory, page)).toEqual([]);
    expect(
      fs
        .readdirSync(directory)
        .some((name) =>
          name.startsWith(`${FOLDER_PAGE_OBJECTS_FILENAME}.corrupted-`),
        ),
    ).toBe(true);
  });

  it('creates user notes only from saved content on the shared slot grid', () => {
    addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
      random: () => 0.5,
    });
    const note = addFolderPageNote(
      directory,
      page,
      { title: '安可', text: '最後一首' },
      {
        id: SECOND_PHOTO_ID,
        now: new Date('2026-10-10T02:00:00.000Z'),
        random: () => 0.5,
      },
    );

    expect(note).toEqual({
      key: `note:${SECOND_PHOTO_ID}`,
      type: 'note',
      source: 'user',
      page,
      placement: { region: 'bottom', anchor: { x: 0.37, y: 0.15 } },
      pinned: false,
      rotation: 0.75,
      order: 2,
      createdAt: '2026-10-10T02:00:00.000Z',
      title: '安可',
      text: '最後一首',
      paper: 'canary',
    });
    expect(() =>
      addFolderPageNote(directory, page, { title: '  ', text: '' }),
    ).toThrow();
    expect(() =>
      addFolderPageNote(directory, page, {
        title: 'x'.repeat(MAX_NOTE_TITLE_LENGTH + 1),
        text: 'ok',
      }),
    ).toThrow();

    const updated = updateFolderPageNote(directory, page, note.key, {
      title: '',
      text: '安可曲備忘',
    });
    expect(updated.title).toBe('');
    expect(updated.text).toBe('安可曲備忘');
    expect(updated.paper).toBe('canary');
    expect(listFolderPageObjects(directory, page)[1].text).toBe('安可曲備忘');

    expect(() =>
      updateFolderPageNote(directory, page, note.key, {
        text: 'x'.repeat(MAX_NOTE_TEXT_LENGTH + 1),
      }),
    ).toThrow();
    expect(() =>
      updateFolderPageNote(directory, page, note.key, { title: '', text: ' ' }),
    ).toThrow();
    expect(() =>
      updateFolderPageNote(directory, page, `photo:${PHOTO_ID}`, { text: 'x' }),
    ).toThrow();
    expect(() =>
      updateFolderPageNote(
        directory,
        { kind: 'playlist', id: 'playlist-2' },
        note.key,
        { text: 'x' },
      ),
    ).toThrow();
    expect(removeFolderPageObject(directory, page, note.key)).toBe(true);
  });

  it('reads notes saved before titles existed as untitled', () => {
    const note = addFolderPageNote(
      directory,
      page,
      { text: '舊便條' },
      { id: PHOTO_ID },
    );
    const manifest = readManifest(directory);
    delete manifest.objects[0].payload.title;
    fs.writeFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      JSON.stringify(manifest),
    );
    expect(listFolderPageObjects(directory, page)[0]).toMatchObject({
      key: note.key,
      title: '',
      text: '舊便條',
    });
  });

  it('picks a bounded paper per note once and derives a stable stock for legacy notes', () => {
    expect(NOTE_PAPERS).toEqual([
      'periwinkle',
      'rose',
      'canary',
      'kraft',
      'ruled',
    ]);
    const first = addFolderPageNote(
      directory,
      page,
      { text: '便條' },
      {
        id: PHOTO_ID,
        random: () => 0,
      },
    );
    const last = addFolderPageNote(
      directory,
      page,
      { text: '便條' },
      {
        id: SECOND_PHOTO_ID,
        random: () => 0.999,
      },
    );
    expect([first.paper, last.paper]).toEqual(['periwinkle', 'ruled']);

    const manifest = readManifest(directory);
    delete manifest.objects[0].payload.paper;
    manifest.objects[1].payload.paper = 'velvet';
    fs.writeFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      JSON.stringify(manifest),
    );
    const derived = listFolderPageObjects(directory, page).map(
      (object) => object.paper,
    );
    derived.forEach((paper) => expect(NOTE_PAPERS).toContain(paper));
    expect(
      readManifest(directory).objects.map((object) => object.payload.paper),
    ).toEqual(derived);
    expect(
      listFolderPageObjects(directory, page).map((object) => object.paper),
    ).toEqual(derived);
  });

  it('leans new objects 0.75°–4° either way instead of a fixed set', () => {
    const lean = (value, id) =>
      addFolderPageNote(
        directory,
        page,
        { text: '便條' },
        {
          id,
          random: () => value,
        },
      ).rotation;
    const rotations = [0, 0.25, 0.4999, 0.5, 0.75, 0.9999].map((value, index) =>
      lean(value, `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`),
    );
    expect(rotations).toEqual([-0.75, -2.4, -4, 0.75, 2.4, 4]);
    for (const rotation of rotations) {
      expect(Math.abs(rotation)).toBeGreaterThanOrEqual(0.75);
      expect(Math.abs(rotation)).toBeLessThanOrEqual(4);
    }
  });

  it('picks a print stock per photo once and derives a stable frame for legacy photos', () => {
    expect(PHOTO_FRAMES).toEqual(['print', 'archival', 'instant']);
    const first = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
      random: () => 0,
    });
    const last = addFolderPagePhoto(directory, page, sourcePath, {
      id: SECOND_PHOTO_ID,
      random: () => 0.999,
    });
    expect([first.frame, last.frame]).toEqual(['print', 'instant']);

    const manifest = readManifest(directory);
    delete manifest.objects[0].payload.frame;
    manifest.objects[1].payload.frame = 'polaroid';
    fs.writeFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      JSON.stringify(manifest),
    );
    const derived = listFolderPageObjects(directory, page).map(
      (object) => object.frame,
    );
    derived.forEach((frame) => expect(PHOTO_FRAMES).toContain(frame));
    expect(
      readManifest(directory).objects.map((object) => object.payload.frame),
    ).toEqual(derived);
  });

  it('files each photo under the nearest common print shape', () => {
    const shapes = [
      [pngHeader(640, 480), 'landscape'],
      [pngHeader(480, 640), 'portrait'],
      [pngHeader(500, 520), 'square'],
      [pngHeader(1920, 1080), 'wide'],
      [pngHeader(1080, 2400), 'tall'],
      [pngHeader(3000, 1000), 'wide'],
    ];
    expect(Object.keys(PHOTO_RATIOS)).toEqual([
      'landscape',
      'portrait',
      'square',
      'wide',
      'tall',
    ]);
    const ratios = shapes.map(([header], index) => {
      fs.writeFileSync(sourcePath, header);
      return addFolderPagePhoto(directory, page, sourcePath, {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      }).ratio;
    });
    expect(ratios).toEqual(shapes.map(([, ratio]) => ratio));
  });

  it('classifies a JPEG as displayed after its EXIF quarter turn', () => {
    const jpegPath = path.join(directory, 'phone.jpg');
    const exifJpeg = (orientation, littleEndian) => {
      const tiff = Buffer.alloc(26);
      tiff.write(littleEndian ? 'II' : 'MM', 0, 'ascii');
      const write16 = (value, at) =>
        littleEndian
          ? tiff.writeUInt16LE(value, at)
          : tiff.writeUInt16BE(value, at);
      const write32 = (value, at) =>
        littleEndian
          ? tiff.writeUInt32LE(value, at)
          : tiff.writeUInt32BE(value, at);
      write16(42, 2);
      write32(8, 4);
      write16(1, 8);
      write16(0x0112, 10);
      write16(3, 12);
      write32(1, 14);
      write16(orientation, 18);
      const exif = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
      const app1 = Buffer.alloc(4);
      app1[0] = 0xff;
      app1[1] = 0xe1;
      app1.writeUInt16BE(exif.length + 2, 2);
      const frame = jpegHeader(4032, 3024);
      return Buffer.concat([
        frame.subarray(0, 2),
        app1,
        exif,
        frame.subarray(2),
      ]);
    };
    const ratioFor = (buffer, id) => {
      fs.writeFileSync(jpegPath, buffer);
      return addFolderPagePhoto(directory, page, jpegPath, { id }).ratio;
    };
    expect(ratioFor(exifJpeg(6, false), PHOTO_ID)).toBe('portrait');
    expect(ratioFor(exifJpeg(8, true), SECOND_PHOTO_ID)).toBe('portrait');
    expect(
      ratioFor(exifJpeg(1, true), '33333333-3333-4333-8333-333333333333'),
    ).toBe('landscape');
  });

  it('never prints wide or tall shapes on instant film', () => {
    fs.writeFileSync(sourcePath, pngHeader(1920, 1080));
    const wide = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
      random: () => 0.999,
    });
    fs.writeFileSync(sourcePath, pngHeader(480, 640));
    const portrait = addFolderPagePhoto(directory, page, sourcePath, {
      id: SECOND_PHOTO_ID,
      random: () => 0.999,
    });
    expect([wide.frame, portrait.frame]).toEqual(['archival', 'instant']);
  });

  it('measures photos saved before ratios existed once and writes them back', () => {
    fs.writeFileSync(sourcePath, pngHeader(480, 640));
    addFolderPagePhoto(directory, page, sourcePath, { id: PHOTO_ID });
    fs.writeFileSync(sourcePath, pngHeader(1920, 1080));
    addFolderPagePhoto(directory, page, sourcePath, { id: SECOND_PHOTO_ID });
    const manifest = readManifest(directory);
    for (const object of manifest.objects) delete object.payload.ratio;
    manifest.objects[1].payload.frame = 'instant';
    fs.writeFileSync(
      path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME),
      JSON.stringify(manifest),
    );

    const listed = listFolderPageObjects(directory, page);
    expect(listed.map((object) => object.ratio)).toEqual(['portrait', 'wide']);
    expect(listed[1].frame).not.toBe('instant');
    expect(
      readManifest(directory).objects.map((object) => object.payload.ratio),
    ).toEqual(['portrait', 'wide']);
  });

  it('writes a short line on instant film and keeps one caption paper', () => {
    const instant = addFolderPagePhoto(directory, page, sourcePath, {
      id: PHOTO_ID,
      random: () => 0.999,
    });
    const print = addFolderPagePhoto(directory, page, sourcePath, {
      id: SECOND_PHOTO_ID,
      random: () => 0,
    });
    expect([instant.frame, print.frame]).toEqual(['instant', 'print']);

    const saved = updateFolderPagePhotoText(
      directory,
      page,
      instant.key,
      { label: '2024 夏', caption: '第一次唱這首。' },
      { random: () => 0.5 },
    );
    expect(saved).toMatchObject({
      label: '2024 夏',
      caption: '第一次唱這首。',
      captionPaper: NOTE_PAPERS[2],
    });
    // A later edit keeps the paper drawn for the first caption.
    expect(
      updateFolderPagePhotoText(
        directory,
        page,
        instant.key,
        { label: '2024 夏', caption: '改寫' },
        { random: () => 0 },
      ).captionPaper,
    ).toBe(NOTE_PAPERS[2]);

    // Only instant film has a lower margin to write on.
    const printed = updateFolderPagePhotoText(directory, page, print.key, {
      label: '不會保存',
      caption: '',
    });
    expect(printed.label).toBe('');
    expect(printed).not.toHaveProperty('captionPaper');

    const cleared = updateFolderPagePhotoText(directory, page, instant.key, {
      label: '',
      caption: '',
    });
    expect(cleared).toMatchObject({ label: '', caption: '' });
    expect(readManifest(directory).objects[0].payload).toEqual({
      imageFilename: 'image.png',
      frame: 'instant',
      ratio: 'landscape',
    });

    expect(() =>
      updateFolderPagePhotoText(directory, page, instant.key, {
        label: 'x'.repeat(MAX_PHOTO_LABEL_LENGTH + 1),
      }),
    ).toThrow('Invalid page photo text.');
    expect(() =>
      updateFolderPagePhotoText(directory, page, instant.key, {
        caption: 'x'.repeat(MAX_PHOTO_CAPTION_LENGTH + 1),
      }),
    ).toThrow('Invalid page photo text.');
    expect(() =>
      updateFolderPagePhotoText(directory, page, 'note:x', { caption: 'a' }),
    ).toThrow('Invalid page photo.');
  });

  it('counts notes toward the shared user object limit', () => {
    for (let index = 0; index < FOLDER_PAGE_USER_OBJECT_LIMIT; index += 1) {
      addFolderPageNote(
        directory,
        page,
        { text: '便條' },
        {
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        },
      );
    }
    expect(() => addFolderPageNote(directory, page, { text: '便條' })).toThrow(
      expect.objectContaining({ code: 'FOLDER_PAGE_OBJECT_LIMIT_REACHED' }),
    );
    expect(() => addFolderPagePhoto(directory, page, sourcePath)).toThrow(
      expect.objectContaining({ code: 'FOLDER_PAGE_OBJECT_LIMIT_REACHED' }),
    );
  });

  it('builds a fixed media URL from an opaque id and validated filename', () => {
    expect(buildFolderPageAssetUrl(PHOTO_ID, 'image.webp')).toBe(
      `utawakui-media://folder-asset/${PHOTO_ID}/image.webp`,
    );
    expect(buildFolderPageAssetUrl('../x', 'image.webp')).toBe('');
  });
});
