function isValidIpv4(value) {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  );
}

function isValidIpv6(value) {
  if (!value.includes(':')) return false;
  try {
    // WHATWG URL parsing is available in Electron main and the renderer and
    // rejects paths, schemes, brackets and malformed IPv6 literals here.
    const parsed = new globalThis.URL(`http://[${value}]/`);
    return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']');
  } catch {
    return false;
  }
}

function isValidDnsHostname(value) {
  return value
    .split('.')
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
    );
}

export function isValidObsHost(value, maxHostLength) {
  if (
    !Number.isSafeInteger(maxHostLength) ||
    maxHostLength <= 0 ||
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxHostLength ||
    value.trim() !== value
  ) {
    return false;
  }
  if (value.includes(':')) return isValidIpv6(value);
  if (/^\d+(?:\.\d+){3}$/.test(value)) return isValidIpv4(value);
  return isValidDnsHostname(value);
}
