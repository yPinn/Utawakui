'use strict';

const os = require('node:os');
const { execFile } = require('node:child_process');

const PROFILE_TIMEOUT_MS = 5000;
// Windows NetworkCategory: 0 Public, 1 Private, 2 DomainAuthenticated.
const PRIVATE_CATEGORIES = new Set([1, 2, 'Private', 'DomainAuthenticated']);

function isPrivateIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p)))
    return false;
  const [a, b] = parts;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

// Private IPv4 addresses of active adapters; loopback and link-local excluded.
function listPrivateInterfaces(networkInterfaces = os.networkInterfaces) {
  const result = [];
  for (const [name, entries] of Object.entries(networkInterfaces() ?? {})) {
    for (const entry of entries ?? []) {
      if (
        entry.internal ||
        (entry.family !== 'IPv4' && entry.family !== 4) ||
        !isPrivateIpv4(entry.address)
      )
        continue;
      result.push({ name, address: entry.address });
    }
  }
  return result;
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: PROFILE_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
    );
  });
}

// Joined by interface index and reported by IPv4 address: adapter names can
// be localized (e.g. 乙太網路) and arrive garbled in the console code page.
const PRIVATE_ADDRESS_SCRIPT = [
  '$p=@{}',
  'Get-NetConnectionProfile | ForEach-Object { $p[[int]$_.InterfaceIndex] = [int]$_.NetworkCategory }',
  '@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $p.ContainsKey([int]$_.InterfaceIndex) } | ForEach-Object { [pscustomobject]@{ IPAddress = $_.IPAddress; NetworkCategory = $p[[int]$_.InterfaceIndex] } }) | ConvertTo-Json -Compress',
].join('; ');

// IPv4 addresses whose network Windows treats as private. Any failure reads
// as unknown, which callers must treat as not private.
async function readPrivateAddresses(run = runPowerShell) {
  let parsed;
  try {
    parsed = JSON.parse(await run(PRIVATE_ADDRESS_SCRIPT));
  } catch {
    return new Set();
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return new Set(
    entries
      .filter((entry) => PRIVATE_CATEGORIES.has(entry?.NetworkCategory))
      .map((entry) => String(entry.IPAddress)),
  );
}

async function describeNetworkScope({
  networkInterfaces = os.networkInterfaces,
  run = runPowerShell,
} = {}) {
  const interfaces = listPrivateInterfaces(networkInterfaces);
  const privateAddresses = interfaces.length
    ? await readPrivateAddresses(run)
    : new Set();
  return interfaces.map((entry) => ({
    ...entry,
    privateNetwork: privateAddresses.has(entry.address),
  }));
}

module.exports = {
  describeNetworkScope,
  isPrivateIpv4,
  listPrivateInterfaces,
  readPrivateAddresses,
};
