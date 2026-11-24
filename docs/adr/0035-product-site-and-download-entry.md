# ADR 0035: Product site and download entry

## Status

Accepted on 2026-11-25. It replaces the "Public product site boundary" section of
[ADR 0007](0007-public-release-app-updates.md). ADR 0007 still owns the update
feed and the public release repository; [ADR 0018](0018-signed-update-manifest.md)
owns update-manifest signing. The site itself is not built yet.

## Context

Feature descriptions, guides and per-release details are moving to a product
site so the public release repository can stay a stable, rarely edited entry
for non-technical users. ADR 0007 planned GitHub Pages in that repository. With
the site source in the private repository, Pages would need a credential that
can write to the public repository, and on GitHub the same `Contents: write`
permission can also replace or delete release assets. A site deployment could
then reach the update feed.

The project already runs the feedback relay as a Cloudflare Worker on a
`llazypilot.com` subdomain (ADR 0016), so the account, DNS and Wrangler workflow
exist.

## Decision

- **Source**: the site lives in the private repository under `site/`. It is never
  packaged with the app.
- **Hosting**: Cloudflare Workers static assets on `utawakui.llazypilot.com`.
  The deployment credential is a Cloudflare API token limited to Workers. It is
  stored in its own protected GitHub environment and never shares an environment
  with `PUBLIC_RELEASE_TOKEN` or the update-signing key.
- **Downloads and updates stay on GitHub Releases.** The site never stores
  installers, blockmaps, `latest.yml` or `update-manifest.json`, and never acts
  as a second update feed.
- **Download entry**: the site serves `/download` as a redirect to the latest
  stable installer on GitHub Releases. The redirect target is written into the
  site's redirect rules at deploy time from published release data; visitors
  trigger no runtime API call. Links in the public README, site and announcements
  use `/download`, so a later change of download host only changes this redirect.
- **Release data**: the site reads published release metadata at build time.
  Publishing a release triggers a site redeploy, so a release adds no separate
  site step.
- **Scope**: the initial site is static. Accounts, forms, uploads, comments,
  third-party embeds and analytics, including Cloudflare Web Analytics, require a
  separate privacy and security review and the necessary disclosure first.
  Large media goes to Cloudflare R2 or stays within the static-asset file limit;
  video platforms are not embedded.
- **Content boundary**: only curated public copy and assets enter the site
  artifact. Private source, internal notes, build logs, credentials, unpublished
  provider details and user media never do. Copy keeps the app's rights-neutral
  boundary: no implied affiliation with OBS, YouTube, Spotify, rightsholders or
  any provider, and provider-backed acquisition is never presented as a licensed
  music service.

## Rejected options

- **GitHub Pages in the public release repository**: the deploy credential could
  modify release assets, the built site would add a branch to the repository
  meant to stay stable, and the default `github.io` address is tied to the
  account and repository name.
- **Hosting installers or the update feed on Cloudflare**: every installed app is
  pinned to the GitHub feed, so a move needs a transition release while old
  clients keep reading GitHub. It also splits the canonical download into two
  copies, puts site and installers behind one credential, and loses GitHub's
  per-asset download counts.
- **Querying the GitHub API from a Worker on each request**: Workers share
  outbound IP addresses, so unauthenticated requests can hit GitHub's per-IP
  rate limit. A deploy-time redirect needs no runtime code.

## Consequences

The public release repository holds only README, LICENSE, SECURITY, third-party
notices and releases,
and changes rarely. The site, the Release notes and the in-app announcement carry
version-specific information. The project now maintains a second Cloudflare
project and a site deployment workflow. Both GitHub and Cloudflare log visitor
requests, so the site still needs a privacy page.
