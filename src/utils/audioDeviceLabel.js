// Pure string classification for MediaDeviceInfo labels — no DOM/Electron
// API access, so it's plain-Node testable per this repo's coverage
// convention (see CaptureDeviceModal.vue for the one caller).
//
// The browser's enumerateDevices() only ever exposes a free-text label, not
// Windows' underlying EndpointFormFactor (Headphones/Speakers/etc.) — that
// property never crosses the Web Audio API boundary. So there is no
// reliable way to tell a real headset apart from real speakers here; don't
// try. Virtual audio cable software is different: VB-CABLE and VoiceMeeter
// ship with fixed, distinctive product names, so name matching is a
// reliable (if not exhaustive) signal for the one device category this
// feature actually cares about.
const VIRTUAL_CABLE_PATTERNS = [
  /vb-audio/i,
  /voicemeeter/i,
  /virtual audio cable/i,
  /^cable (input|output)/i,
];

export function isVirtualCableDevice(label) {
  if (!label) return false;
  return VIRTUAL_CABLE_PATTERNS.some((pattern) => pattern.test(label));
}

// Windows prefixes playback endpoints with a device-role label ("Default -"/
// "Communications -") and Chromium appends the endpoint's raw USB VID:PID in
// parentheses for USB audio devices. The USB id is useful for disambiguating
// in a full device picker (CaptureDeviceModal.vue keeps it), but the role
// prefix reads better pulled out into its own badge there instead of left
// inline (see deviceRoleBadgeLabel) — both are too noisy for a compact
// inline label (PlayerBar.vue's guide-vocal slider rows), where
// shortenDeviceLabel strips both.
const ROLE_PREFIX_PATTERN = /^(?:Default|Communications)\s*-\s*/i;
const USB_ID_SUFFIX_PATTERN = /\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i;

export function shortenDeviceLabel(label) {
  if (!label) return '';
  return label
    .replace(ROLE_PREFIX_PATTERN, '')
    .replace(USB_ID_SUFFIX_PATTERN, '')
    .trim();
}

// Same role-prefix strip as shortenDeviceLabel, minus the USB-id strip — for
// CaptureDeviceModal.vue's rows, which pull the role out into a badge (see
// deviceRoleBadgeLabel) but still want the USB id inline to tell apart
// multiple role entries that share one physical device's name.
export function stripDeviceRolePrefix(label) {
  if (!label) return '';
  return label.replace(ROLE_PREFIX_PATTERN, '').trim();
}

// 'default'/'communications' are fixed, non-localized deviceId values (see
// compareAudioDevices) — a safer badge-text source than re-matching the
// label prefix, which is already being stripped from display by the time a
// caller would want to know which badge to show.
const ROLE_DEVICE_BADGE_LABELS = { default: '預設', communications: '通訊' };

export function deviceRoleBadgeLabel(deviceId) {
  return ROLE_DEVICE_BADGE_LABELS[deviceId] ?? null;
}

// enumerateDevices() order is OS/driver enumeration order, not meaningful
// to a user scanning a picker by device name — CaptureDeviceModal.vue
// sorts each of its groups (virtual cable / other) with this instead.
// Alphabetical, but the Default/Communications role pseudo-devices (fixed,
// non-localized deviceId values per the Web Audio API spec, unlike their
// label prefix) are pinned first in that order — losing track of which
// entry mirrors the system default would be a regression, not a tidy-up.
const ROLE_DEVICE_PRIORITY = { default: 0, communications: 1 };

// Locale pinned explicitly, not left to the runtime default: this codebase
// has no i18n layer (every string in the app is hardcoded Traditional
// Chinese), and localeCompare's Latin-vs-CJK ordering is locale-sensitive —
// leaving it unset would sort labels differently in a test run than in the
// packaged app depending on whichever locale each process happens to carry.
const DEVICE_LABEL_LOCALE = 'zh-Hant';

export function compareAudioDevices(a, b) {
  const aPriority = ROLE_DEVICE_PRIORITY[a.deviceId] ?? 2;
  const bPriority = ROLE_DEVICE_PRIORITY[b.deviceId] ?? 2;
  if (aPriority !== bPriority) return aPriority - bPriority;
  return (a.label || '').localeCompare(b.label || '', DEVICE_LABEL_LOCALE);
}

// enumerateDevices() lists the Default/Communications role pseudo-devices
// as separate entries from the literal physical device they currently
// point at — Chromium copies that device's own label into each one
// (post role-prefix), so three rows can read identically apart from their
// "Default -"/"Communications -" prefix. CaptureDeviceModal.vue merges
// them into a single row (badges instead of duplicate rows) via this.
//
// The merge key is the post-strip label, not deviceId — the whole point is
// that 'default'/'communications'/the literal id are three different
// deviceId values naming the same physical endpoint.
export function groupDevicesByIdentity(devices) {
  const groups = new Map();
  for (const device of devices) {
    const identity = stripDeviceRolePrefix(device.label) || device.deviceId;
    let group = groups.get(identity);
    if (!group) {
      group = {
        label: identity,
        deviceIds: [],
        // Falls back to whichever entry is seen first; overwritten below
        // the moment a literal (non-role) entry turns up in the group.
        canonicalDeviceId: device.deviceId,
        hasDefault: false,
        hasCommunications: false,
      };
      groups.set(identity, group);
    }
    group.deviceIds.push(device.deviceId);
    if (device.deviceId === 'default') {
      group.hasDefault = true;
    } else if (device.deviceId === 'communications') {
      group.hasCommunications = true;
    } else {
      // A literal id survives independently of whatever the OS default
      // happens to be later, unlike 'default'/'communications' — prefer it
      // as the id CaptureDeviceModal.vue actually persists via setSinkId.
      group.canonicalDeviceId = device.deviceId;
    }
  }
  return Array.from(groups.values()).map((group) => ({
    label: group.label,
    deviceIds: group.deviceIds,
    canonicalDeviceId: group.canonicalDeviceId,
    roleBadges: [
      group.hasDefault ? deviceRoleBadgeLabel('default') : null,
      group.hasCommunications ? deviceRoleBadgeLabel('communications') : null,
    ].filter(Boolean),
    // For compareAudioDevices: sort the merged row as if it were whichever
    // role it carries (default beats communications beats a plain device),
    // regardless of which literal deviceId ended up canonical above.
    sortDeviceId: group.hasDefault
      ? 'default'
      : group.hasCommunications
        ? 'communications'
        : group.canonicalDeviceId,
  }));
}
