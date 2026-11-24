# Release Notes Template

`npm run release:prepare <version>` creates `docs/releases/v<version>.md` from the
copy block below and carries over the previous install guidance. Public notes are bilingual and
written for broad readers with no assumed engineering background. Explain what
people can do, what they may notice, and what action they need to take instead of
copying the commit log or describing how the software is built.

## Section Rules

- Notes are publication-ready even while the GitHub Release is a draft: no draft
  status, pending review, planned delivery or process instructions. Unfinished
  acceptance belongs in internal records; real limitations stay in the notes.
- Required: both versioned titles with a one- or two-sentence summary, at least
  one matching change category (**New Features**, **Improvements**, **Bug
  Fixes**) and both install sections. Remove empty optional sections; keep
  Chinese and English sections paired.
- Copy both summaries verbatim into `shared/releaseAnnouncement.json`, which
  drives the in-app "what's new" modal. `shared/releaseAnnouncement.test.js`
  checks the version and exact agreement.
- **Before Installing** carries the fixed disclosures, one short line each:
  official download and checksum, Unknown publisher, update behavior, settings
  and library retention, rights to user-supplied media, and the Discord invite.
  `release:prepare` copies them from the previous release; edit only what changed.
- **Upgrade Notes** is for actions an existing user must take or changes to data,
  settings, compatibility or update behavior. **Known Limitations** lists material
  constraints that ship in this build. **A Note from the Developer** is an
  optional blockquote and never the only place for required information.
- Write for readers with no engineering background: say what people can do,
  notice or need to act on. Avoid internal library, model, format, component or
  protocol names unless the product shows them.

Commit types are evidence, not copy: `feat` usually maps to New Features, `fix`
to Bug Fixes, and user-visible `perf`, `refactor` or `build` changes to
Improvements; internal `docs`, `test` and `ci` work is omitted. For example, write
"OBS previews refresh more reliably after changes" instead of describing component
remounts.

## Copy Template

```markdown
# Utawakui v<version> 公開測試版

<用一至兩句說明本版對使用者最重要的改變。>

<!-- 選填；沒有個人留言時，連同英文段落一起刪除。 -->

## 開發者的話

> <簡短的個人留言；不可只在這裡放升級步驟、限制或安全資訊。>

<!-- 以下三個分類至少保留一個，並與英文分類一一對應。 -->

## 新功能

- <使用者現在可以完成的新工作。>

## 改善

- <既有操作、效能或可靠性的改善。>

## 問題修復

- <已修正且使用者可感知的問題。>

<!-- 選填；既有使用者必須採取動作時保留。 -->

## 升級注意事項

- <手動步驟、相容性、資料或設定影響。>

<!-- 選填；本版仍有影響使用的限制時保留。 -->

## 已知限制

- <限制、影響及可行的因應方式。>

## 安裝前須知

- <官方下載位置、checksum 驗證方式，以及「未知的發行者」提示。>
- <更新是否自動，以及哪些步驟需要明確操作。>
- <覆蓋安裝、設定、曲庫與自備素材的保留／備份說明。>
- <使用者自備素材的權利責任。>
- 加入 [Discord](https://discord.gg/yJKddEtpNt) 社群，查看公告或回饋想法。

---

## Utawakui v<version> Public Test

<Summarize the most important user-facing changes in one or two sentences.>

<!-- Optional; remove together with the Chinese section when unused. -->

## A Note from the Developer

> <A brief personal note; do not put required upgrade, limitation, or security
> information only here.>

<!-- Keep at least one category and match the selected Chinese categories. -->

## New Features

- <A new task users can now complete.>

## Improvements

- <An improvement to an existing workflow, performance, or reliability.>

## Bug Fixes

- <A resolved user-visible problem.>

<!-- Optional; keep when an existing user must take action. -->

## Upgrade Notes

- <Manual steps or compatibility, data, or settings impact.>

<!-- Optional; keep when a limitation affects use of this build. -->

## Known Limitations

- <Limitation, impact, and available workaround.>

## Before Installing

- <Official download location, checksum verification, and the "Unknown
  publisher" prompt.>
- <Update behavior and steps that require explicit action.>
- <Installation, settings, library, and user-media retention or backup guidance.>
- <User responsibility for rights to supplied media.>
- Join the [Discord](https://discord.gg/yJKddEtpNt) community for announcements
  and feedback.
```
