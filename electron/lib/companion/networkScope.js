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

// Joined by interface index and keyed by IPv4 address. Output is forced to
// UTF-8 so localized profile names (e.g. 網路 3) survive the console.
const PROFILE_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$p=@{}',
  'Get-NetConnectionProfile | ForEach-Object { $p[[int]$_.InterfaceIndex] = $_ }',
  '@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $p.ContainsKey([int]$_.InterfaceIndex) } | ForEach-Object { $c = $p[[int]$_.InterfaceIndex]; [pscustomobject]@{ IPAddress = $_.IPAddress; NetworkCategory = [int]$c.NetworkCategory; Name = [string]$c.Name } }) | ConvertTo-Json -Compress',
].join('; ');

// Windows network profile per IPv4 address: whether it is private and the
// profile's name. Any failure reads as unknown, which callers must treat as
// not private.
async function readNetworkProfiles(run = runPowerShell) {
  let parsed;
  try {
    parsed = JSON.parse(await run(PROFILE_SCRIPT));
  } catch {
    return new Map();
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return new Map(
    entries
      .filter((entry) => entry?.IPAddress)
      .map((entry) => [
        String(entry.IPAddress),
        {
          privateNetwork: PRIVATE_CATEGORIES.has(entry.NetworkCategory),
          network: typeof entry.Name === 'string' ? entry.Name : '',
        },
      ]),
  );
}

async function describeNetworkScope({
  networkInterfaces = os.networkInterfaces,
  run = runPowerShell,
} = {}) {
  const interfaces = listPrivateInterfaces(networkInterfaces);
  const profiles = interfaces.length
    ? await readNetworkProfiles(run)
    : new Map();
  return interfaces.map((entry) => {
    const profile = profiles.get(entry.address);
    return {
      ...entry,
      network: profile?.network ?? '',
      privateNetwork: Boolean(profile?.privateNetwork),
    };
  });
}

module.exports = {
  describeNetworkScope,
  isPrivateIpv4,
  listPrivateInterfaces,
  readNetworkProfiles,
};
