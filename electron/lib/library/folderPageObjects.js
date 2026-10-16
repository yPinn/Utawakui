'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  atomicCopyFileSync,
  atomicWriteJson,
  backupCorrupted,
} = require('../atomicWrite');
const {
  MAX_ARTWORK_BYTES,
  hasValidArtworkDimensions,
  inspectArtworkImage,
} = require('../artwork/image');

const FOLDER_PAGE_OBJECTS_FILENAME = 'folder-page-assets.json';
const FOLDER_PAGE_ASSETS_DIRECTORY = 'folder-page-assets';
const FOLDER_PAGE_OBJECTS_VERSION = 4;
const FOLDER_PAGE_USER_OBJECT_LIMIT = 12;
const MAX_PAGE_ID_LENGTH = 200;
const MAX_LAYER_ORDER = 1_000;
const MAX_LAYOUT_BATCH_SIZE = 64;
const MAX_OBJECT_ROTATION = 5;
const MAX_NOTE_TEXT_LENGTH = 2_000;
const MAX_NOTE_TITLE_LENGTH = 80;
// Instant film carries one short line; the caption note holds the rest.
const MAX_PHOTO_LABEL_LENGTH = 16;
const MAX_PHOTO_CAPTION_LENGTH = 80;
// Paper stocks a new user note may be printed on; picked once at creation.
const NOTE_PAPERS = Object.freeze([
  'periwinkle',
  'rose',
  'canary',
  'kraft',
  'ruled',
]);

// Photo print stocks, picked once at creation like note papers.
const PHOTO_FRAMES = Object.freeze(['print', 'archival', 'instant']);
// Common print shapes; a photo is filed under the nearest one by aspect.
const PHOTO_RATIOS = Object.freeze({
  landscape: 4 / 3,
  portrait: 3 / 4,
  square: 1,
  wide: 16 / 9,
  tall: 9 / 16,
});
// Instant film comes in square, portrait and wide-landscape sheets only.
const INSTANT_RATIOS = new Set(['square', 'portrait', 'landscape']);
const DEFAULT_PHOTO_RATIO = 'landscape';
// EXIF orientations 5–8 rotate the stored pixels by a quarter turn.
const QUARTER_TURN_ORIENTATIONS = new Set([5, 6, 7, 8]);

function keyHash(key) {
  let hash = 0;
  for (const character of String(key)) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash;
}

// Objects saved before a stock existed get a stable one from their key.
function paperForKey(key) {
  return NOTE_PAPERS[keyHash(key) % NOTE_PAPERS.length];
}

function framesForRatio(ratio) {
  return INSTANT_RATIOS.has(ratio)
    ? PHOTO_FRAMES
    : PHOTO_FRAMES.filter((frame) => frame !== 'instant');
}

function frameForKey(key, ratio) {
  const frames = framesForRatio(ratio);
  return frames[keyHash(key) % frames.length];
}

function isPhotoRatio(value) {
  return typeof value === 'string' && Object.hasOwn(PHOTO_RATIOS, value);
}

// Nearest shape on a log scale, so 2:1 and 1:2 sit as far from square.
function classifyPhotoRatio(width, height) {
  if (!(width > 0) || !(height > 0)) return DEFAULT_PHOTO_RATIO;
  const aspect = Math.log(width / height);
  let nearest = DEFAULT_PHOTO_RATIO;
  let nearestDistance = Infinity;
  for (const [ratio, value] of Object.entries(PHOTO_RATIOS)) {
    const distance = Math.abs(aspect - Math.log(value));
    if (distance < nearestDistance) {
      nearest = ratio;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// Reads the EXIF orientation of a JPEG; 1 (upright) when absent or unreadable.
function jpegOrientation(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xda || length < 2) return 1;
    const start = offset + 4;
    if (
      marker === 0xe1 &&
      start + 14 <= buffer.length &&
      buffer.toString('ascii', start, start + 4) === 'Exif'
    ) {
      return exifOrientation(buffer, start + 6, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return 1;
}

function exifOrientation(buffer, tiff, end) {
  const order = buffer.toString('ascii', tiff, tiff + 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const little = order === 'II';
  const read16 = (at) =>
    little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
  const read32 = (at) =>
    little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
  const limit = Math.min(end, buffer.length);
  const ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > limit) return 1;
  const count = read16(ifd);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > limit) return 1;
    if (read16(entry) === 0x0112) {
      const value = read16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

// Classifies the photo as it is displayed, after any EXIF quarter turn.
function photoRatioForImage(buffer, image) {
  const turned =
    image.extension === '.jpg' &&
    QUARTER_TURN_ORIENTATIONS.has(jpegOrientation(buffer));
  return turned
    ? classifyPhotoRatio(image.height, image.width)
    : classifyPhotoRatio(image.width, image.height);
}

function pickStock(stocks, random) {
  return stocks[
    Math.min(stocks.length - 1, Math.floor(randomUnit(random) * stocks.length))
  ];
}
const INITIAL_ANCHOR_JITTER = 0.04;
// New objects lean a little, never squarely: either way, 0.75°–4°.
const INITIAL_ROTATION_RANGE = Object.freeze([0.75, 4]);
// New user objects land on a 4×3 grid inside the bottom Folder region.
const INITIAL_SLOT_X = Object.freeze([0.1, 0.37, 0.63, 0.9]);
const INITIAL_SLOT_Y = Object.freeze([0.15, 0.5, 0.85]);
const PAGE_KINDS = new Set(['playlist', 'album', 'artist']);
const PLACEMENT_REGIONS = new Set(['paper', 'side', 'bottom']);
const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ASSET_ID_PATTERN = new RegExp(`^${UUID_PATTERN}$`, 'iu');
const USER_KEY_PATTERN = new RegExp(`^([a-z]+):(${UUID_PATTERN})$`, 'iu');
const DERIVED_KEY_PATTERN = /^derived:[a-z][a-z0-9-]{0,63}$/u;
const LEGACY_LAYOUT_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const IMAGE_FILENAME_PATTERN = /^image\.(?:jpg|png|webp)$/u;

const OBJECT_TYPES = Object.freeze({
  photo: Object.freeze({
    sources: new Set(['user']),
    sanitizePayload: (payload, source, key) => {
      if (!isImageFilename(payload?.imageFilename)) return null;
      // A missing ratio is measured from the stored image by readManifest.
      const ratio = isPhotoRatio(payload.ratio) ? payload.ratio : null;
      const frame =
        PHOTO_FRAMES.includes(payload.frame) &&
        (payload.frame !== 'instant' || !ratio || INSTANT_RATIOS.has(ratio))
          ? payload.frame
          : frameForKey(key, ratio);
      const sanitized = { imageFilename: payload.imageFilename, frame, ratio };
      if (
        frame === 'instant' &&
        isBoundedText(payload.label, MAX_PHOTO_LABEL_LENGTH)
      ) {
        sanitized.label = payload.label;
      }
      if (
        isBoundedText(payload.caption, MAX_PHOTO_CAPTION_LENGTH) &&
        payload.caption !== ''
      ) {
        sanitized.caption = payload.caption;
        sanitized.captionPaper = NOTE_PAPERS.includes(payload.captionPaper)
          ? payload.captionPaper
          : paperForKey(key);
      }
      return sanitized;
    },
  }),
  note: Object.freeze({
    sources: new Set(['user', 'derived']),
    sanitizePayload: (payload, source, key) => {
      if (source === 'derived') return {};
      if (
        typeof payload?.text !== 'string' ||
        payload.text.length > MAX_NOTE_TEXT_LENGTH
      ) {
        return null;
      }
      // Legacy or unknown paper is derived instead of dropping the note.
      const paper = NOTE_PAPERS.includes(payload.paper)
        ? payload.paper
        : paperForKey(key);
      // Notes saved before titles existed read as untitled.
      const title = isNoteTitle(payload.title) ? payload.title : '';
      return { title, text: payload.text, paper };
    },
  }),
});

function validationError(message, code = 'FOLDER_PAGE_OBJECT_INVALID') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateFolderPageIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!PAGE_KINDS.has(value.kind)) return null;
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > MAX_PAGE_ID_LENGTH ||
    /[\\/\p{Cc}]/u.test(value.id)
  ) {
    return null;
  }
  return { kind: value.kind, id: value.id };
}

function isAssetId(value) {
  return typeof value === 'string' && ASSET_ID_PATTERN.test(value);
}

function isImageFilename(value) {
  return typeof value === 'string' && IMAGE_FILENAME_PATTERN.test(value);
}

function isLayerOrder(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_LAYER_ORDER;
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeAnchor(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1
  ) {
    return null;
  }
  return { x: value.x, y: value.y };
}

function normalizePlacement(value) {
  if (!value || typeof value !== 'object') return null;
  if (!PLACEMENT_REGIONS.has(value.region)) return null;
  const anchor = normalizeAnchor(value.anchor);
  return anchor ? { region: value.region, anchor } : null;
}

function normalizeRotation(value) {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || Math.abs(value) > MAX_OBJECT_ROTATION) {
    return null;
  }
  return value;
}

// Returns { source, type?, assetId? } or null; user keys carry their type.
function parseObjectKey(value) {
  if (typeof value !== 'string') return null;
  if (DERIVED_KEY_PATTERN.test(value)) return { source: 'derived' };
  const match = USER_KEY_PATTERN.exec(value);
  if (!match || !Object.hasOwn(OBJECT_TYPES, match[1])) return null;
  return { source: 'user', type: match[1], assetId: match[2] };
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const page = validateFolderPageIdentity(value.page);
  const parsedKey = parseObjectKey(value.key);
  const definition = Object.hasOwn(OBJECT_TYPES, value.type)
    ? OBJECT_TYPES[value.type]
    : null;
  const placement = normalizePlacement(value.placement);
  const rotation = normalizeRotation(value.rotation);
  if (
    !page ||
    !parsedKey ||
    !definition ||
    value.source !== parsedKey.source ||
    (parsedKey.type && parsedKey.type !== value.type) ||
    !definition.sources.has(value.source) ||
    !placement ||
    rotation === null ||
    typeof value.pinned !== 'boolean' ||
    !isLayerOrder(value.order) ||
    !isTimestamp(value.createdAt)
  ) {
    return null;
  }
  const payload = definition.sanitizePayload(
    value.payload,
    value.source,
    value.key,
  );
  if (!payload) return null;
  return {
    key: value.key,
    page,
    type: value.type,
    source: value.source,
    placement,
    pinned: value.pinned,
    rotation,
    order: value.order,
    payload,
    createdAt: value.createdAt,
  };
}

function manifestPath(directory) {
  return path.join(directory, FOLDER_PAGE_OBJECTS_FILENAME);
}

function assetDirectory(directory, assetId) {
  return path.join(directory, FOLDER_PAGE_ASSETS_DIRECTORY, assetId);
}

function photoAssetId(object) {
  return object.type === 'photo' ? parseObjectKey(object.key).assetId : null;
}

function photoPath(directory, object) {
  return path.join(
    assetDirectory(directory, photoAssetId(object)),
    object.payload.imageFilename,
  );
}

function measureStoredPhotoRatio(directory, object) {
  try {
    const buffer = fs.readFileSync(photoPath(directory, object));
    const image = inspectArtworkImage(buffer);
    return image ? photoRatioForImage(buffer, image) : DEFAULT_PHOTO_RATIO;
  } catch {
    return DEFAULT_PHOTO_RATIO;
  }
}

function samePage(left, right) {
  return left.kind === right.kind && left.id === right.id;
}

function pageIdentityKey(page) {
  return `${page.kind}\0${page.id}`;
}

// Gives every page a dense 1..n order; ties keep derived objects behind.
function rebaseOrders(objects) {
  const byPage = new Map();
  for (const object of objects) {
    const pageKey = pageIdentityKey(object.page);
    if (!byPage.has(pageKey)) byPage.set(pageKey, []);
    byPage.get(pageKey).push(object);
  }
  const orders = new Map();
  for (const pageObjects of byPage.values()) {
    [...pageObjects]
      .sort(
        (left, right) =>
          left.order - right.order ||
          (left.source === right.source
            ? 0
            : left.source === 'derived'
              ? -1
              : 1) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.key.localeCompare(right.key),
      )
      .forEach((object, index) => orders.set(object, index + 1));
  }
  return objects.map((object) => ({ ...object, order: orders.get(object) }));
}

function migrateLegacyManifest(data) {
  const objects = [];
  const fallbackCreatedAt = new Date(0).toISOString();
  for (const asset of Array.isArray(data.assets) ? data.assets : []) {
    if (!isAssetId(asset?.id)) continue;
    objects.push({
      key: `photo:${asset.id}`,
      page: asset.page,
      type: 'photo',
      source: 'user',
      placement: asset.pinPlacement ?? {
        region: 'paper',
        anchor: asset.anchor,
      },
      pinned: asset.pinned,
      rotation: asset.rotation,
      order: asset.order,
      payload: { imageFilename: asset.imageFilename },
      createdAt: asset.createdAt,
    });
  }
  for (const layout of Array.isArray(data.layouts) ? data.layouts : []) {
    if (!LEGACY_LAYOUT_KEY_PATTERN.test(layout?.key ?? '')) continue;
    objects.push({
      key: `derived:${layout.key}`,
      page: layout.page,
      type: 'note',
      source: 'derived',
      placement: layout.pinPlacement ?? {
        region: 'paper',
        anchor: layout.anchor,
      },
      pinned: layout.pinned,
      rotation: 0,
      order: layout.order,
      payload: {},
      createdAt: fallbackCreatedAt,
    });
  }
  return objects;
}

function readManifest(directory) {
  const filePath = manifestPath(directory);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { objects: [], changed: false };
    throw error;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    backupCorrupted(filePath);
    return { objects: [], changed: false };
  }
  const legacy = data?.version !== FOLDER_PAGE_OBJECTS_VERSION;
  const rawObjects = legacy
    ? Array.isArray(data?.assets)
      ? migrateLegacyManifest(data)
      : null
    : Array.isArray(data?.objects)
      ? data.objects
      : null;
  if (!rawObjects) {
    backupCorrupted(filePath);
    return { objects: [], changed: false };
  }

  let changed = legacy;
  const identities = new Set();
  const objects = [];
  for (const rawObject of rawObjects) {
    const object = sanitizeObject(rawObject);
    const identity = object
      ? `${pageIdentityKey(object.page)}\0${object.key}`
      : '';
    if (
      !object ||
      identities.has(identity) ||
      (object.type === 'photo' && !fs.existsSync(photoPath(directory, object)))
    ) {
      changed = true;
      continue;
    }
    // Photos saved before ratios existed are measured once and written back.
    if (object.type === 'photo' && !object.payload.ratio) {
      const ratio = measureStoredPhotoRatio(directory, object);
      const frame =
        object.payload.frame === 'instant' && !INSTANT_RATIOS.has(ratio)
          ? frameForKey(object.key, ratio)
          : object.payload.frame;
      object.payload = { ...object.payload, ratio, frame };
      changed = true;
    }
    // Persist stocks derived for objects saved before they existed.
    if (
      (object.type === 'note' &&
        object.source === 'user' &&
        rawObject.payload?.paper !== object.payload.paper) ||
      (object.type === 'photo' &&
        rawObject.payload?.frame !== object.payload.frame)
    ) {
      changed = true;
    }
    identities.add(identity);
    objects.push(object);
  }
  const rebased = rebaseOrders(objects);
  if (rebased.some((object, index) => object.order !== objects[index].order)) {
    changed = true;
  }
  return { objects: rebased, changed };
}

function writeManifest(directory, objects) {
  fs.mkdirSync(directory, { recursive: true });
  atomicWriteJson(manifestPath(directory), {
    version: FOLDER_PAGE_OBJECTS_VERSION,
    objects,
  });
}

function loadObjects(directory) {
  const result = readManifest(directory);
  if (result.changed) writeManifest(directory, result.objects);
  return result.objects;
}

function buildFolderPageAssetUrl(assetId, filename) {
  if (!isAssetId(assetId) || !isImageFilename(filename)) return '';
  return `utawakui-media://folder-asset/${encodeURIComponent(assetId)}/${encodeURIComponent(filename)}`;
}

function projectObject(object) {
  const projection = {
    key: object.key,
    type: object.type,
    source: object.source,
    page: { ...object.page },
    placement: {
      region: object.placement.region,
      anchor: { ...object.placement.anchor },
    },
    pinned: object.pinned,
    rotation: object.rotation,
    order: object.order,
    createdAt: object.createdAt,
  };
  if (object.type === 'photo') {
    projection.imageUrl = buildFolderPageAssetUrl(
      photoAssetId(object),
      object.payload.imageFilename,
    );
    projection.frame = object.payload.frame;
    projection.ratio = object.payload.ratio;
    projection.label = object.payload.label ?? '';
    projection.caption = object.payload.caption ?? '';
    if (object.payload.captionPaper) {
      projection.captionPaper = object.payload.captionPaper;
    }
  } else if (object.type === 'note' && object.source === 'user') {
    projection.title = object.payload.title;
    projection.text = object.payload.text;
    projection.paper = object.payload.paper;
  }
  return projection;
}

function requirePage(pageValue) {
  const page = validateFolderPageIdentity(pageValue);
  if (!page) throw validationError('Invalid folder page identity.');
  return page;
}

function listPageObjects(objects, page) {
  return objects
    .filter((object) => samePage(object.page, page))
    .sort((left, right) => left.order - right.order)
    .map(projectObject);
}

function listFolderPageObjects(directory, pageValue) {
  const page = requirePage(pageValue);
  return listPageObjects(loadObjects(directory), page);
}

function randomUnit(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function roundedNormalized(value) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(4));
}

function initialPose(slotIndex, random) {
  const column = slotIndex % INITIAL_SLOT_X.length;
  const row = Math.min(
    Math.floor(slotIndex / INITIAL_SLOT_X.length),
    INITIAL_SLOT_Y.length - 1,
  );
  const jitter = () => (randomUnit(random) * 2 - 1) * INITIAL_ANCHOR_JITTER;
  const anchor = {
    x: roundedNormalized(INITIAL_SLOT_X[column] + jitter()),
    y: roundedNormalized(INITIAL_SLOT_Y[row] + jitter()),
  };
  // One draw picks the side and the lean, so the random sequence is unchanged.
  const lean = randomUnit(random);
  const [minRotation, maxRotation] = INITIAL_ROTATION_RANGE;
  const magnitude =
    minRotation + ((lean % 0.5) / 0.5) * (maxRotation - minRotation);
  // Round the size before the sign so both sides land on the same 0.05° steps.
  const rotation = ((lean < 0.5 ? -1 : 1) * Math.round(magnitude * 20)) / 20;
  return {
    placement: { region: 'bottom', anchor },
    rotation,
  };
}

function readPhotoSource(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    throw validationError('A local image selection is required.');
  }
  const sourceStat = fs.statSync(sourcePath);
  if (!sourceStat.isFile()) {
    throw validationError('The selection must be a local file.');
  }
  if (sourceStat.size > MAX_ARTWORK_BYTES) {
    throw validationError('Page photos must be 10 MiB or smaller.');
  }
  const buffer = fs.readFileSync(sourcePath);
  if (buffer.length > MAX_ARTWORK_BYTES) {
    throw validationError('Page photos must be 10 MiB or smaller.');
  }
  const image = inspectArtworkImage(buffer);
  if (!image) throw validationError('The selection is not a valid image.');
  if (!hasValidArtworkDimensions(image)) {
    throw validationError('The image dimensions are outside supported bounds.');
  }
  return { ...image, ratio: photoRatioForImage(buffer, image) };
}

// Builds a new user object on the next bottom-region slot of its page.
function createUserObject(objects, page, type, payload, options = {}) {
  const pageObjects = objects.filter((object) => samePage(object.page, page));
  const userObjects = pageObjects.filter((object) => object.source === 'user');
  if (userObjects.length >= FOLDER_PAGE_USER_OBJECT_LIMIT) {
    throw validationError(
      `A folder page can contain at most ${FOLDER_PAGE_USER_OBJECT_LIMIT} objects.`,
      'FOLDER_PAGE_OBJECT_LIMIT_REACHED',
    );
  }
  const id = options.id ?? crypto.randomUUID();
  const key = `${type}:${id}`;
  if (!isAssetId(id) || objects.some((object) => object.key === key)) {
    throw validationError('Invalid or duplicate page object id.');
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const random =
    typeof options.random === 'function' ? options.random : Math.random;
  const pose = initialPose(userObjects.length, random);
  return {
    id,
    object: {
      key,
      page,
      type,
      source: 'user',
      placement: pose.placement,
      pinned: false,
      rotation: pose.rotation,
      order: Math.min(pageObjects.length + 1, MAX_LAYER_ORDER),
      payload,
      createdAt: now.toISOString(),
    },
  };
}

function addFolderPagePhoto(directory, pageValue, sourcePath, options = {}) {
  const page = requirePage(pageValue);
  const image = readPhotoSource(sourcePath);
  const objects = loadObjects(directory);
  const imageFilename = `image${image.extension}`;
  const random =
    typeof options.random === 'function' ? options.random : Math.random;
  const { id, object: photo } = createUserObject(
    objects,
    page,
    'photo',
    { imageFilename, ratio: image.ratio },
    { ...options, random },
  );
  // Drawn after the pose so existing placement sequences stay stable.
  photo.payload.frame = pickStock(framesForRatio(image.ratio), random);
  const targetDirectory = assetDirectory(directory, id);

  fs.mkdirSync(targetDirectory, { recursive: true });
  try {
    atomicCopyFileSync(sourcePath, path.join(targetDirectory, imageFilename));
    writeManifest(directory, [...objects, photo]);
  } catch (error) {
    fs.rmSync(targetDirectory, { recursive: true, force: true });
    throw error;
  }
  return projectObject(photo);
}

function isNoteTitle(value) {
  return typeof value === 'string' && value.length <= MAX_NOTE_TITLE_LENGTH;
}

function isBoundedText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

// Saves a photo's instant label and caption; the caption paper is drawn once.
function updateFolderPagePhotoText(
  directory,
  pageValue,
  key,
  content,
  options = {},
) {
  const page = requirePage(pageValue);
  if (parseObjectKey(key)?.type !== 'photo') {
    throw validationError('Invalid page photo.');
  }
  const label = content?.label ?? '';
  const caption = content?.caption ?? '';
  if (
    !isBoundedText(label, MAX_PHOTO_LABEL_LENGTH) ||
    !isBoundedText(caption, MAX_PHOTO_CAPTION_LENGTH)
  ) {
    throw validationError('Invalid page photo text.');
  }
  const objects = loadObjects(directory);
  const index = objects.findIndex(
    (object) => object.key === key && samePage(object.page, page),
  );
  if (index < 0) throw validationError('Page photo not found.');
  const random =
    typeof options.random === 'function' ? options.random : Math.random;
  const previous = objects[index].payload;
  const payload = { ...previous };
  delete payload.label;
  delete payload.caption;
  delete payload.captionPaper;
  if (payload.frame === 'instant' && label.trim() !== '') payload.label = label;
  if (caption.trim() !== '') {
    payload.caption = caption;
    // Drawn on the first caption and kept while the caption is edited.
    payload.captionPaper =
      previous.captionPaper ?? pickStock(NOTE_PAPERS, random);
  }
  objects[index] = { ...objects[index], payload };
  writeManifest(directory, objects);
  return projectObject(objects[index]);
}

// A note is created only from saved editor content; empty notes never exist.
function requireNoteContent(content) {
  const title = content?.title ?? '';
  const text = content?.text ?? '';
  if (
    !isNoteTitle(title) ||
    typeof text !== 'string' ||
    text.length > MAX_NOTE_TEXT_LENGTH ||
    (title.trim() === '' && text.trim() === '')
  ) {
    throw validationError('Invalid page note content.');
  }
  return { title, text };
}

function addFolderPageNote(directory, pageValue, content, options = {}) {
  const page = requirePage(pageValue);
  const { title, text } = requireNoteContent(content);
  const objects = loadObjects(directory);
  const random =
    typeof options.random === 'function' ? options.random : Math.random;
  const { object: note } = createUserObject(
    objects,
    page,
    'note',
    { title, text, paper: pickStock(NOTE_PAPERS, random) },
    { ...options, random },
  );
  writeManifest(directory, [...objects, note]);
  return projectObject(note);
}

function updateFolderPageNote(directory, pageValue, key, content) {
  const page = requirePage(pageValue);
  if (parseObjectKey(key)?.type !== 'note') {
    throw validationError('Invalid page note.');
  }
  const { title, text } = requireNoteContent(content);
  const objects = loadObjects(directory);
  const index = objects.findIndex(
    (object) => object.key === key && samePage(object.page, page),
  );
  if (index < 0) throw validationError('Page note not found.');
  objects[index] = {
    ...objects[index],
    payload: { ...objects[index].payload, title, text },
  };
  writeManifest(directory, objects);
  return projectObject(objects[index]);
}

function applyLayoutEntry(objects, page, entry, now) {
  const parsedKey = parseObjectKey(entry?.key);
  const placement = normalizePlacement(entry?.placement);
  if (
    !parsedKey ||
    !placement ||
    typeof entry.pinned !== 'boolean' ||
    !isLayerOrder(entry.order)
  ) {
    throw validationError('Invalid page object layout.');
  }
  const index = objects.findIndex(
    (object) => object.key === entry.key && samePage(object.page, page),
  );
  if (index >= 0) {
    objects[index] = {
      ...objects[index],
      placement,
      pinned: entry.pinned,
      order: entry.order,
    };
    return;
  }
  // Derived objects get a record on their first saved layout only.
  if (parsedKey.source !== 'derived') {
    throw validationError('Page object not found.');
  }
  const created = sanitizeObject({
    key: entry.key,
    page,
    type: entry.type,
    source: 'derived',
    placement,
    pinned: entry.pinned,
    rotation: entry.rotation,
    order: entry.order,
    payload: {},
    createdAt: now.toISOString(),
  });
  if (!created) throw validationError('Invalid derived page object.');
  objects.push(created);
}

function saveFolderPageLayout(directory, pageValue, entries, options = {}) {
  const page = requirePage(pageValue);
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > MAX_LAYOUT_BATCH_SIZE ||
    new Set(entries.map((entry) => entry?.key)).size !== entries.length
  ) {
    throw validationError('Invalid page object layout batch.');
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const objects = [...loadObjects(directory)];
  for (const entry of entries) applyLayoutEntry(objects, page, entry, now);
  const rebased = rebaseOrders(objects);
  writeManifest(directory, rebased);
  return listPageObjects(rebased, page);
}

function removeFolderPageObject(directory, pageValue, key) {
  const page = validateFolderPageIdentity(pageValue);
  const parsedKey = parseObjectKey(key);
  if (!page || parsedKey?.source !== 'user') return false;
  const objects = loadObjects(directory);
  const target = objects.find(
    (object) => object.key === key && samePage(object.page, page),
  );
  if (!target) return false;
  writeManifest(
    directory,
    rebaseOrders(objects.filter((object) => object !== target)),
  );
  if (target.type === 'photo') {
    fs.rmSync(assetDirectory(directory, photoAssetId(target)), {
      recursive: true,
      force: true,
    });
  }
  return true;
}

function deleteFolderPageObjects(directory, pageValue) {
  const page = validateFolderPageIdentity(pageValue);
  if (!page) return 0;
  const objects = loadObjects(directory);
  const removed = objects.filter((object) => samePage(object.page, page));
  if (removed.length === 0) return 0;
  writeManifest(
    directory,
    objects.filter((object) => !samePage(object.page, page)),
  );
  for (const object of removed) {
    if (object.type !== 'photo') continue;
    fs.rmSync(assetDirectory(directory, photoAssetId(object)), {
      recursive: true,
      force: true,
    });
  }
  return removed.length;
}

function resolveFolderPageAssetPath(directory, assetId, filename) {
  if (!isAssetId(assetId) || !isImageFilename(filename)) return null;
  const photo = loadObjects(directory).find(
    (object) =>
      object.key === `photo:${assetId}` &&
      object.payload.imageFilename === filename,
  );
  if (!photo) return null;
  const resolved = photoPath(directory, photo);
  return fs.existsSync(resolved) ? resolved : null;
}

module.exports = {
  FOLDER_PAGE_ASSETS_DIRECTORY,
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
};
