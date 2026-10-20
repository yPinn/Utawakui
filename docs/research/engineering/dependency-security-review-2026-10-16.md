# Dependency security review — 2026-10-16

## Scope and evidence

This review prioritizes the one critical and two high Dependabot advisories open
on `yPinn/Utawakui` at the time of inspection. All three identify
`scripts/lyrics-provider-netease-runtime/package-lock.json`, not the desktop
application lockfile. GitHub labels their scope as runtime because this separate
evaluation package has production dependencies; that does not mean they ship in
the desktop installer.

The independent package pins `@neteasecloudmusicapienhanced/api` 4.40.1. It is used
only by the explicit NetEase evaluation CLI and one-shot worker, outside the
desktop startup path and production dependency closure. The product's NetEase
acquisition adapter is a separate implementation; see the
[acquisition contract](../../contracts/lyrics-sources.md). The
[release inventory](../../operations/release-inventory.md) and
`electron-builder.yml` retain their existing package boundaries.

Evidence was collected using read-only `gh api` open-alert queries, both npm
lockfile audits, upstream advisories, and the installed package sources after
`npm ci --ignore-scripts`. No provider smoke, sentinel, credentialed request,
online lyrics evaluation, dependency-alert dismissal, or push was performed.

## Critical and high findings

| Finding                                                                                                   | Dependency path and actual exposure                                                                                                                                                                                                                                                                                                                                                                    | Disposition                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [proxy-addr / GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), critical, alert 84 | Evaluation client → Express 5, and unblockmusic-utils → Express 4 → proxy-addr. Exploitation requires a server trusting a malformed IPv4-mapped IPv6 subnet. Our worker does not start the exported Express server or configure that trust subnet.                                                                                                                                                     | Updated the single shared instance from 2.0.7 to 2.0.8 within both existing parent ranges. No override or parent upgrade.                                                                                                                      |
| [basic-ftp / GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r), high, alert 70      | Evaluation client → pac-proxy-agent → get-uri 6.0.5 → basic-ftp. A malicious FTP listing can block the event loop. Evaluation probes do not request an FTP resource or configure PAC; inherited proxy environment variables are excluded by the worker contract.                                                                                                                                       | Scoped `get-uri`'s basic-ftp dependency to 6.2.3, replacing 5.3.1. Patched floor is 6.2.1.                                                                                                                                                     |
| [node-forge / GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), high, alert 83     | Evaluation client → node-forge 1.4.0. The vulnerable operation is RSA PKCS#1 v1.5 signature verification. The pinned client's only direct node-forge import is in `util/crypto.js`, using `publicKeyFromPem`, RSA encryption with `NONE`, and byte-to-hex conversion; no signature verification call was found there. This is a reachability assessment, not proof the package is safe for other uses. | Unfixed: upstream reports no patched release and npm latest remains 1.4.0. Owner chose to retain the tool, explicitly record the finding, and defer online evaluation. No local crypto fork, vulnerable-package removal, or alert suppression. |

The basic-ftp 6 major change rejects separate data-transfer hosts by default,
per the [upstream release notes](https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.0.0).
The scoped override preserves this safer default. The parent get-uri client uses
`access`, `lastMod`, `list`, `downloadTo`, and `close`, which were checked against
the installed patched client. The provider version, integrity, registry allowlist,
worker IPC, feature gates, and installer configuration were not changed.

## Verification and operational limits

- Added lockfile security contracts first and observed failures on proxy-addr
  2.0.7 and the unpatched FTP dependency, then verified the patched lock. Every
  matching instance is checked and an empty match set fails the tests.
- `npm ci --ignore-scripts --no-audit --no-fund --prefix scripts/lyrics-provider-netease-runtime`
  succeeded. Only the proxy-addr and basic-ftp package entries changed, together
  with the scoped override. Every locked artifact retains SHA-512 integrity;
  the existing runtime-lock validator passes.
- Actual proxy-addr 2.0.8 rejects `203.0.113.10` under `::ffff:10.0.0.0/8`, while
  a normal `10.0.0.0/8` trust subnet still accepts `10.1.2.3`.
- An isolated parser child completed a malformed approximately 128 KiB Unix
  listing within a three-second process deadline. A synthetic loopback FTP
  server verified actual get-uri 6 plus basic-ftp 6.2.3 downloads both with MDTM
  and with the listing fallback, including returned bytes and modification time.
  This was local compatibility verification, not provider or internet testing.
- Focused NetEase, dependency-security, runtime-configuration, and release
  contracts passed: 9 files, 119 tests passed and 1 existing skip.
- The opt-in integration suite is retained next to the independent package as
  `dependency-security.test.cjs`: 4 tests passed, no skips. It uses Node's test
  runner because the desktop's normal npm install intentionally does not install
  this separate dependency tree. Re-run explicitly after installing that tree:

  ```sh
  npm ci --ignore-scripts --no-audit --no-fund --prefix scripts/lyrics-provider-netease-runtime
  node --test scripts/lyrics-provider-netease-runtime/dependency-security.test.cjs
  ```

- Full desktop Vitest coverage passed: 779 files, 7,667 passed and 1 existing
  skip. Statements 88.99%, branches 81.31%, functions 92.04%, lines 91.41%.
  The unchanged coverage ratchet passed, including preload branches at 100%.
- ESLint, Markdownlint, Prettier, `git diff --check`, and the production Vite
  build passed. The build retained its existing large-chunk warning. Packaging
  contracts were tested; no new installer or live Electron acceptance run was
  required or claimed for changes confined to an excluded evaluation tree.

Changing the template lock does not modify previously provisioned ignored
evaluation generations or their active pointer. Before any future online
evaluation, revisit the unresolved node-forge advisory, explicitly authorize
resuming evaluation, and provision from the reviewed template. The provisioner
includes the lock SHA-256 in the generation identity, so a changed lock creates a
different generation. No existing runtime generation or user data was deleted.

## Audit results after the critical/high pass

The root `npm audit --omit=dev --json` reports zero vulnerabilities in the desktop
production dependency closure at this review time. This is an npm advisory
result, not a claim that Electron or all application behavior is vulnerability-free.

The independent NetEase audit remains nonzero: 0 critical, 2 high package nodes
(node-forge and its parent client), and 5 moderate package nodes. Its two high
nodes represent the same unfixed node-forge advisory, not two independent high
vulnerabilities. Moderate findings remain in qs, ip-address, and music-metadata;
this critical/high pass did not update those unrelated dependency trees.

The root full audit also remains nonzero: 5 high, 8 moderate, and 3 low package
nodes, all outside the production closure. The high chain is markdownlint-cli2 →
globby / fast-glob / micromatch → braces 3.0.3, associated with
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The current npm braces release is 3.0.3 and the advisory has no patched release.
The normal lint command supplies repository-owned glob patterns; untrusted
arbitrary glob input must not be passed to this toolchain. No forced downgrade
of markdownlint or replacement of its dependency internals was attempted.
Moderate sprintf-js and low KaTeX findings are separate follow-up work. npm's
propagated package totals must not be compared directly with GitHub's count of
individual advisories. Since these changes are not pushed, GitHub alert state
has not been updated by this review.

## Moderate/low follow-up — 2026-10-16

Owner subsequently authorized fixing remaining advisories with an available
upstream patch, while retaining the unresolved node-forge and braces records and
not performing online evaluation or pushing commits. The audit counts above are
the earlier critical/high checkpoint; the results below supersede them.

| Package        | Previous | Reviewed version | Resolution                                                                                                                                                                                                                   |
| -------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| qs             | 6.15.3   | 6.16.1           | Independent evaluation override within major 6, necessary because its Express 4 and body-parser parents request `~6.15.1`. All locked instances are checked against `>=6.16.0 <7`.                                           |
| ip-address     | 10.5.0   | 10.7.4           | Updated within the existing socks dependency range. All instances are checked against `>=10.7.1 <11`, covering the subnet, link-local/NAT64, and oversized-diagnostic advisories.                                            |
| music-metadata | 11.15.0  | 11.16.1          | Updated within the evaluation client's existing `^11.14.0` range; checked against `>=11.16.0 <12`. The desktop application's independent 12.2.0 pin was not changed.                                                         |
| KaTeX          | 0.16.47  | 0.18.2           | Scoped override under micromark-extension-math in the development toolchain. The patched floor comes from [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7). No desktop runtime dependency was added. |

No upstream fix is currently published for the separate moderate
[sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): npm latest
is still 1.1.3, and the advisory lists all versions through 1.1.3 as affected.
Its development-only chain is electron-builder → app-builder-lib → @electron/get
→ global-agent → roarr → sprintf-js. No attempt was made to hide the finding,
replace the logger, or downgrade the packaging toolchain. This is a third
unresolved advisory alongside node-forge and braces, not a patched issue.

Verification adds three evaluation version-floor tests that failed against the
old lock, then passed after the three targeted updates. The opt-in suite now has
seven passing tests, including normal nested query roundtrips, prototype-key
rejection, mixed-family subnet rejection with valid same-family controls,
link-local IPv6 recognition, and in-memory PCM metadata parsing. No real song
or provider request was used. Existing proxy and FTP regressions remain covered.

KaTeX was verified with both a failing version-floor test and a failing inherited
trust behavior test before updating. After updating, the same behavior test
rejects inherited trust while preserving an explicit own trust option; inline
and display Markdown math also render normally. The test uses an options
prototype, never mutates Object.prototype, and does not insert generated HTML
into a browser.

Post-update audit: the independent evaluation tree has 0 critical, 2 high package
nodes from the single node-forge advisory, and no moderate or low findings. The
root tree has 5 high and 8 moderate package nodes from the unpatched braces and
sprintf-js advisories, and no low findings. Desktop production audit remains
zero. Package-node counts include propagated parent findings; these are not
counts of independent advisories. GitHub alerts remain unchanged until a later
authorized push and rescan.

Final follow-up verification: 779 Vitest files passed, 7,673 tests passed and 1
existing test remained skipped; the seven opt-in integration tests also passed.
Coverage is unchanged at 88.99% statements, 81.31% branches, 92.04% functions,
and 91.41% lines. All original coverage ratchets passed without policy changes.
ESLint, Markdownlint (116 files), Prettier, production build, packaging contracts,
and diff whitespace checks passed. The build retains its existing large-chunk
warning. No installer build or live Electron acceptance run was claimed for
these evaluation/development-only dependency updates.
