'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_DEVICES = 8;
const LABEL_MAX = 40;
const SEEN_WRITE_INTERVAL_MS = 60_000;
const CREDENTIAL_RE = /^[A-Za-z0-9_-]{43}$/u;

function storeError(code) {
  return Object.assign(new Error(`Companion device store: ${code}`), {
    companionStatus: code,
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest();
}

function normalizeLabel(value) {
  const label =
    typeof value === 'string'
      ? value
          .replace(/[\p{Cc}\p{Cf}]/gu, '')
          .trim()
          .slice(0, LABEL_MAX)
      : '';
  return label || null;
}

// Remembered phones. Only a SHA-256 of each credential is kept, encrypted with
// the OS-backed safeStorage; the credential itself lives only on the phone.
function createCompanionDeviceStore({
  filePath,
  safeStorage,
  now = () => new Date(),
  randomBytes = crypto.randomBytes,
}) {
  let devices = null;
  const seenWrites = new Map();

  function available() {
    return safeStorage?.isEncryptionAvailable?.() === true;
  }

  function load() {
    if (devices) return devices;
    devices = [];
    let raw;
    try {
      raw = fs.readFileSync(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') return devices;
      throw error;
    }
    if (!available()) throw storeError('secure-storage-unavailable');
    const doc = JSON.parse(safeStorage.decryptString(raw));
    if (doc?.version !== 1 || !Array.isArray(doc.devices))
      throw storeError('invalid');
    devices = doc.devices.filter(
      (device) =>
        typeof device?.id === 'string' &&
        /^[a-f0-9]{64}$/u.test(device.credentialSha256) &&
        normalizeLabel(device.label),
    );
    return devices;
  }

  function save() {
    if (!available()) throw storeError('secure-storage-unavailable');
    const data = safeStorage.encryptString(
      JSON.stringify({ version: 1, devices }),
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, data, { flag: 'wx' });
    try {
      fs.renameSync(temporary, filePath);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  const view = ({ id, label, createdAt, lastSeenAt }) => ({
    id,
    label,
    createdAt,
    lastSeenAt,
  });

  function list() {
    return load().map(view);
  }

  // Browsers only reveal the device kind ("iPhone"), so a second phone of
  // the same kind is numbered: "iPhone", "iPhone 2", "iPhone 3"…
  function uniqueLabel(labelInput) {
    const base = normalizeLabel(labelInput);
    if (!base) return null;
    const taken = new Set(load().map((device) => device.label));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const suffix = ` ${n}`;
      const candidate = `${base.slice(0, LABEL_MAX - suffix.length).trimEnd()}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  function add(labelInput) {
    if (!available()) throw storeError('secure-storage-unavailable');
    const label = uniqueLabel(labelInput);
    if (!label) throw storeError('invalid');
    if (load().length >= MAX_DEVICES) throw storeError('full');
    const credential = randomBytes(32).toString('base64url');
    const stamp = now().toISOString();
    const device = {
      id: crypto.randomUUID(),
      label,
      credentialSha256: sha256(credential).toString('hex'),
      createdAt: stamp,
      lastSeenAt: stamp,
    };
    devices.push(device);
    save();
    seenWrites.set(device.id, Date.parse(stamp));
    return { device: view(device), credential };
  }

  // Constant-time match; records last-seen at most once a minute per device.
  function authenticate(credential) {
    if (typeof credential !== 'string' || !CREDENTIAL_RE.test(credential))
      return null;
    const digest = sha256(credential);
    let match = null;
    for (const device of load()) {
      const stored = Buffer.from(device.credentialSha256, 'hex');
      if (crypto.timingSafeEqual(stored, digest)) match = device;
    }
    if (!match) return null;
    const at = now();
    match.lastSeenAt = at.toISOString();
    if (at - (seenWrites.get(match.id) ?? 0) >= SEEN_WRITE_INTERVAL_MS) {
      seenWrites.set(match.id, at.getTime());
      try {
        save();
      } catch {
        /* Last-seen is informational; authentication still succeeds. */
      }
    }
    return view(match);
  }

  // A name the person chose is kept as typed.
  function rename(id, labelInput) {
    const label = normalizeLabel(labelInput);
    if (!label) throw storeError('invalid');
    const device = load().find((item) => item.id === id);
    if (!device) return null;
    if (device.label !== label) {
      device.label = label;
      save();
    }
    return view(device);
  }

  function revoke(id) {
    const before = load().length;
    devices = devices.filter((device) => device.id !== id);
    if (devices.length === before) return false;
    save();
    return true;
  }

  function revokeAll() {
    const count = load().length;
    devices = [];
    if (count) save();
    return count;
  }

  return {
    available,
    list,
    add,
    uniqueLabel,
    rename,
    authenticate,
    revoke,
    revokeAll,
  };
}

module.exports = {
  MAX_DEVICES,
  createCompanionDeviceStore,
  normalizeLabel,
};
