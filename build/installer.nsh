; Custom NSIS hooks for electron-builder.
;
; Bilingual (zh_TW / en_US, see electron-builder.yml's installerLanguages).
; Keep app-data cleanup opt-in: Utawakui is local-first, and uninstalling the
; binary should not silently erase user state. These sections appear as
; checkboxes on the uninstaller components page.

; ADR 0002 keeps the packaged exe named electron.exe, which would otherwise
; leak into the install path too. Override APP_FILENAME only, so install
; paths still read "Utawakui".
!ifdef APP_FILENAME
  !undef APP_FILENAME
!endif
!define APP_FILENAME "Utawakui"

; ---------------------------------------------------------------------------
; Bilingual strings. Must come after installer.nsi's own `!insertmacro
; addLangs` (which defines LANG_TRADCHINESE/LANG_ENGLISH from
; installerLanguages) and before customWelcomePage/customUnWelcomePage use
; $(...) below — both hold here since customHeader is inserted right after
; addLangs, and NSIS resolves $(...) at compile time regardless of macro
; expansion order.
; ---------------------------------------------------------------------------
!macro customHeader
  LangString utaWelcomeTitle ${LANG_TRADCHINESE} "安裝 Utawakui"
  LangString utaWelcomeTitle ${LANG_ENGLISH} "Install Utawakui"

  LangString utaWelcomeText ${LANG_TRADCHINESE} "Utawakui 是給歌回直播使用的本機曲庫與播放控制台。安裝後即可使用曲庫、播放、匯入與設定，並建立開始功能表與桌面捷徑。$\r$\n$\r$\n外部來源、歌詞、音訊處理與對外輸出屬於進階功能，需自行在設定頁啟用；啟用時才會連線或下載所需工具。$\r$\n$\r$\n解除安裝預設只移除應用程式，你的設定與曲庫會保留。"
  LangString utaWelcomeText ${LANG_ENGLISH} "Utawakui is a local music library and playback console for karaoke streams. Installing sets up the library, playback, import and settings, and creates Start Menu and desktop shortcuts.$\r$\n$\r$\nExternal sources, lyrics, audio processing and stream output are advanced features you enable yourself in Settings — nothing connects or downloads until you do.$\r$\n$\r$\nUninstalling removes only the application by default; your settings and library are kept."

  LangString utaUnWelcomeTitle ${LANG_TRADCHINESE} "解除安裝 Utawakui"
  LangString utaUnWelcomeTitle ${LANG_ENGLISH} "Uninstall Utawakui"

  LangString utaUnWelcomeText ${LANG_TRADCHINESE} "解除安裝會移除 Utawakui 應用程式，以及安裝器留下的快取。$\r$\n$\r$\n下一頁可分別勾選是否一併刪除：已下載的功能工具與模型、應用程式設定，以及你的本機曲庫資料夾。三項預設皆不勾選。$\r$\n$\r$\n若檔案正被占用，清理會在重新開機後完成。"
  LangString utaUnWelcomeText ${LANG_ENGLISH} "Uninstalling removes the Utawakui application and the cache left behind by the installer.$\r$\n$\r$\nOn the next page you can separately choose to also delete: downloaded tools and models, application settings, and your local music library folder. All three are unchecked by default.$\r$\n$\r$\nIf files are in use, cleanup finishes after a restart."

  LangString utaSecDeps ${LANG_TRADCHINESE} "清除已下載的功能工具與模型 (yt-dlp / ffmpeg / 分離模型)"
  LangString utaSecDeps ${LANG_ENGLISH} "Delete downloaded tools and models (yt-dlp / ffmpeg / separation models)"

  LangString utaSecAppData ${LANG_TRADCHINESE} "清除應用程式設定與資料 (%APPDATA%\Utawakui)"
  LangString utaSecAppData ${LANG_ENGLISH} "Delete application settings and data (%APPDATA%\Utawakui)"

  LangString utaSecLibrary ${LANG_TRADCHINESE} "刪除本機曲庫資料夾"
  LangString utaSecLibrary ${LANG_ENGLISH} "Delete local music library folder"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(utaWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(utaWelcomeText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !ifdef MUI_WELCOMEPAGE_TITLE
    !undef MUI_WELCOMEPAGE_TITLE
  !endif
  !ifdef MUI_WELCOMEPAGE_TEXT
    !undef MUI_WELCOMEPAGE_TEXT
  !endif
  !define MUI_WELCOMEPAGE_TITLE "$(utaUnWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(utaUnWelcomeText)"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Persist the chosen installer language so the uninstaller (which by default
; just follows OS language again) matches what was picked at install time.
; electron-builder doesn't configure any MUI_LANGDLL_REGISTRY_* define, so
; nothing else remembers this. Runs after registryAddInstallInfo has already
; created INSTALL_REGISTRY_KEY (see installSection.nsh), and is cleaned up
; automatically — uninstaller.nsh's own DeleteRegKey on INSTALL_REGISTRY_KEY
; takes this value with it.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallerLanguage" "$LANGUAGE"
!macroend

; Runs before any uninstall section and before the components page is shown
; (uninstaller.nsh calls customUnInit inside un.onInit, ahead of page
; display), so both the restored language and the library-path lookup are
; ready in time.
!macro customUnInit
  ; Declared here (like the official uninstaller.nsh's own
  ; `Var /GLOBAL isDeleteAppData`), not at file top-level: this whole file
  ; is !include'd into both the installer- and uninstaller-producing NSIS
  ; compile passes, but $LibraryDir is only ever used on the uninstall
  ; side (this macro and customUnInstallSection below) — an unconditional
  ; top-level Var would sit unused in the installer-side pass and trip
  ; NSIS's "wasting memory" warning (fatal, since warningsAsErrors is on).
  Var /GLOBAL LibraryDir

  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallerLanguage"
  ${ifNot} $0 == ""
    StrCpy $LANGUAGE $0
  ${endIf}

  ; Electron's userData is always per-user, even for an all-users install —
  ; same reasoning as the SetShellVarContext calls in customUnInstall(Section)
  ; below.
  SetShellVarContext current

  StrCpy $LibraryDir ""
  ClearErrors
  FileOpen $1 "$APPDATA\Utawakui\library-path.txt" r
  ${ifNot} ${Errors}
    FileReadUTF16LE $1 $LibraryDir
    FileClose $1
  ${endIf}

  ; Can't touch the SEC_UN_LIBRARY section here directly: ${SEC_UN_LIBRARY}
  ; is a preprocessor !define created by the `Section ... SEC_UN_LIBRARY`
  ; declaration itself (see customUnInstallSection below), and NSIS resolves
  ; ${...} tokens in a single top-to-bottom pass — this macro is expanded
  ; inside Function un.onInit, textually before that Section exists in the
  ; compiled script, so ${SEC_UN_LIBRARY} would still be undefined here.
  ; `Call` has no such restriction (it's a runtime jump, resolved after the
  ; whole script is parsed), so the actual SectionSetText call is deferred
  ; into a Function declared after the Section, only reached via Call.
  Call un.utaApplyLibrarySectionText
!macroend

; Unconditional, not a checkbox: this is the installer's own copy of itself
; (APP_INSTALLER_STORE_FILE, written by electron-builder's own
; templates/nsis/include/installer.nsh for a possible future
; electron-updater), not user content. ~130MB and never cleaned up by the
; stock uninstaller.nsh. APP_PACKAGE_NAME (not a literal) is the same define
; electron-builder derives from package.json's "name" and uses for this
; exact path elsewhere, so a rename stays in sync.
!macro customUnInstall
  SetShellVarContext current
  RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
!macroend

!macro customUnInstallSection
  Section /o "un.$(utaSecDeps)" SEC_UN_DEPS
    SetShellVarContext current
    RMDir /r "$APPDATA\Utawakui\dependencies"
  SectionEnd

  Section /o "un.$(utaSecAppData)" SEC_UN_APPDATA
    SetShellVarContext current
    RMDir /r "$APPDATA\Utawakui"
  SectionEnd

  ; Title is overwritten below once the real path is known (and the whole
  ; section hidden if there is none) — the placeholder here is never shown
  ; as-is.
  Section /o "un.$(utaSecLibrary)" SEC_UN_LIBRARY
    ; $LibraryDir came from a file on disk, i.e. untrusted input crossing a
    ; trust boundary — re-check it's non-empty here too, since an empty
    ; path would make RMDir /r target $INSTDIR.
    ${ifNot} $LibraryDir == ""
      RMDir /r /REBOOTOK "$LibraryDir"
    ${endIf}
  SectionEnd

  ; Must live after the Section above — see the comment in customUnInit on
  ; why ${SEC_UN_LIBRARY} can't be referenced any earlier in the script.
  ; Called (not inserted) from customUnInit, before the components page is
  ; shown.
  Function un.utaApplyLibrarySectionText
    ; library-path.txt is written by electron/main/configState.js on every
    ; app launch/config change, but it can predate a library move, be stale
    ; from a hand-cleared config dir, or simply not exist yet. Hide the
    ; section entirely rather than show a checkbox that would do nothing —
    ; SectionSetText with an empty string is how NSIS hides a component.
    ${if} $LibraryDir != ""
    ${andIf} ${FileExists} "$LibraryDir\*.*"
      StrCpy $0 "$(utaSecLibrary) ($LibraryDir)"
      SectionSetText ${SEC_UN_LIBRARY} $0
    ${else}
      SectionSetText ${SEC_UN_LIBRARY} ""
    ${endIf}
  FunctionEnd
!macroend
