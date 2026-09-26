# ADR 0018: Signed update manifest as an independent integrity layer

## Status

Accepted foundation; production activation pending (2026-09-26).

The exact installer binding, multi-key verifier, signing／verification tools and
split release workflow are implemented and tested. Production enforcement remains
off through `shared/appUpdateValues.json` because no production key or protected
signing secret has been provisioned. None of this shipped in v0.3.0, so the current
public channel remains the explicitly accepted unsigned channel from ADR 0007.

## Context

`electron-updater` already checks the downloaded installer's SHA-512 against
`latest.yml`. That detects corruption, but a compromised publish credential could
replace the installer and `latest.yml` together. An independent key must therefore
sign the exact installer identity that `electron-updater` selected, while remaining
outside the publish credential's blast radius.

This does not reopen ADR 0007's decisions. Utawakui keeps `electron-updater`, does
not add a custom privileged installer, and does not require an Authenticode
certificate. Windows may continue to show Unknown publisher.

## Decision

### Cryptographic contract

- The manifest uses Ed25519 signatures through Node's built-in `crypto` API.
- Installer integrity uses the same SHA-512 digest already carried by
  `electron-updater`; the signed entry binds installer basename, byte size and
  SHA-512.
- A key id is the lowercase SHA-256 fingerprint of the public key's SPKI DER bytes.
  A separate label is for human identification.
- Signed bytes use the RFC 8785 JSON Canonicalization Scheme data model: sorted
  object keys, ECMAScript primitive serialization, finite numbers, valid Unicode
  and no sparse／undefined values. The `signatures` envelope is excluded.
- Release artifacts are public, so content encryption is not used.

Manifest schema version 2 contains:

- `version` and `releaseDate`;
- bounded `files` entries with `name`, `size` and lowercase hexadecimal `sha512`;
- one or more `signatures` entries with fingerprint `keyId`, `algorithm` and
  hexadecimal signature.

The envelope supports one-of-N verification. During rotation, the same payload can
carry active and retiring signatures so clients that skipped the transition release
can still verify the latest manifest.

### Runtime boundary

`electron/main/appUpdateService.js` retains a main-private descriptor from
`electron-updater`'s `update-available` event. It accepts one Windows installer
candidate and normalizes the updater's Base64 SHA-512 to the manifest's hexadecimal
form. Before download, the signed manifest must match the descriptor's version,
basename, byte size and SHA-512 exactly. Missing, ambiguous, duplicate, malformed or
mismatched metadata fails closed with a bounded public error. URLs and file metadata
do not cross IPC.

`shared/updateSigningKeys.json` is the packaged trust registry. Runtime production
verification accepts only allowlisted production keys in `active`, `retiring` or
`recovery` state. Development and revoked keys cannot authorize a production
update. The current registry contains only a development key, and
`signedManifestEnabled` is therefore false.

This design borrows TUF's target binding and overlapping trust ideas, but is not a
TUF implementation. It has no root／targets／snapshot／timestamp role separation,
threshold policy, metadata expiry or freeze-attack protection.

### Release credential separation

`.github/workflows/release.yml` has four jobs:

1. `validate` checks the source tag and signing policy.
2. `package` builds and verifies the unsigned Windows updater bundle without any
   secret.
3. `sign`, only when production enforcement is enabled, runs behind the protected
   `update-signing` environment. It may read the active signing key and one optional
   retiring-key secret, but cannot read the publish token. Once the registry declares
   a retiring production key, that secret and its verified signature are mandatory.
4. `publish` runs behind the `release` environment. It re-verifies the downloaded
   bundle and signed manifest, may read `PUBLIC_RELEASE_TOKEN`, and cannot read a
   signing key.

The workflow creates only a draft. With the current disabled gate, `sign` is skipped
and the existing unsigned draft path remains operational.

## Rotation And Recovery

Initial activation requires one production `active` public key, its private key in
the protected `update-signing` environment, `activeProductionKeyId` set to its
fingerprint, and `signedManifestEnabled` changed to true in the same reviewed release
source. A pretrusted offline `recovery` public key is strongly recommended before
activation.

Normal rotation is an overlap, not a point replacement:

1. Add the new public key as `active`, change the old key to `retiring`, and set
   `activeProductionKeyId` to the new fingerprint.
2. Temporarily provision both active and retiring private keys in the signing
   environment. Each new manifest must contain both signatures.
3. Keep the retiring signature until the project deliberately raises its minimum
   supported updater version beyond every build that trusts only the old key.
   Removing it earlier strands clients that skipped releases.

If the active key is lost but an uncompromised recovery key was pretrusted, first
promote that recovery key to `active`, point `activeProductionKeyId` at it, revoke
the lost key, and use the promoted key to sign a recovery release that also embeds
a new replacement public key. In the following release, promote the replacement,
mark the recovery key `retiring`, and dual-sign the overlap. If no trusted private
key remains, the signed update path cannot repair itself; recovery requires a
manually installed higher version. A compromised key also requires a support-floor
decision because already installed clients cannot learn that their embedded key was
revoked without first trusting another valid signature.

## Consequences

- A publish-token compromise alone cannot produce an accepted installer once the
  production gate is enabled.
- A signing-key compromise, compromised approved signing job, freeze attack and
  Windows publisher impersonation remain separate risks.
- Missing or invalid `update-manifest.json` deliberately blocks in-app download after
  activation. Release acceptance must verify the public asset before publication.
- The remaining work is operational: provision protected production／recovery keys,
  activate the gate in a release, and complete v0.3.0-to-next-version acceptance.

## References

- [ADR 0007: Public app updates use a separate release repository](0007-public-release-app-updates.md)
- [RFC 8032: EdDSA](https://www.rfc-editor.org/info/rfc8032/)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- [The Update Framework specification](https://theupdateframework.github.io/specification/v1.0.26/)
