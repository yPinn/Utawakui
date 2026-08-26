# Release Notes Template

Use this template for `docs/releases/v<version>.md`. Public notes are bilingual and
written for broad readers with no assumed engineering background. Explain what
people can do, what they may notice, and what action they need to take instead of
copying the commit log or describing how the software is built.

## Section Rules

- The versioned Chinese and English titles, their short summaries, and both
  installation sections are required.
- Prefer everyday language and short sentences. Avoid internal library, model,
  format, component, pipeline, lifecycle, and protocol names unless the term is
  visible in the product and helps the reader act.
- Keep at least one matching change category in both languages. Include **New
  Features**, **Improvements**, and **Bug Fixes** only when that category has
  content; remove empty categories.
- Include **Upgrade Notes** when an existing user must take an action or when data,
  settings, compatibility, or update behavior changes.
- Include **Known Limitations** for material constraints that remain in the shipped
  artifact. Do not disguise a limitation as an improvement.
- **A Note from the Developer** is optional. When used, keep the Chinese and English
  sections together and write the message as a blockquote. It may add gratitude,
  context, or personality, but must not be the only place for upgrade steps,
  security disclosures, known limitations, or other required information.
- Keep the unsigned-publisher disclosure, official download location, checksum,
  update behavior, data-retention guidance, and user-provided-media rights current
  in every public-test note. State each disclosure once, briefly, with its practical
  effect or next action.

Conventional Commit types are source evidence, not release-note copy:

- `feat` usually maps to **New Features**;
- `fix` maps to **Bug Fixes**;
- user-visible `perf`, `refactor`, `build`, or operational changes may map to
  **Improvements**;
- internal-only `docs`, `test`, `ci`, and refactors are normally omitted.

Translate source evidence into reader outcomes. For example:

- write “The app can check for later releases and guide the download and install”
  instead of “Added update metadata”;
- write “Improved regular vocal-separation quality” instead of naming an internal
  model or recipe;
- write “OBS previews refresh more reliably after changes” instead of describing
  component remounts or lifecycle handling.

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

<!-- 選填；發布成品仍有重要限制時保留。 -->

## 已知限制

- <限制、影響及可行的因應方式。>

## 安裝前須知

- <簽章／發行者狀態。>
- <官方下載位置與 checksum 驗證方式。>
- <更新是否自動，以及哪些步驟需要明確操作。>
- <覆蓋安裝、設定、曲庫與自備素材的保留／備份說明。>
- <使用者自備素材的權利責任。>

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

<!-- Optional; keep for material limitations in the shipped artifact. -->

## Known Limitations

- <The limitation, impact, and available workaround.>

## Before Installing

- <Signature and publisher status.>
- <Official download location and checksum verification.>
- <Update behavior and steps that require explicit action.>
- <Installation, settings, library, and user-media retention or backup guidance.>
- <User responsibility for rights to supplied media.>
```
