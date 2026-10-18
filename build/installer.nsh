; Custom NSIS hooks for electron-builder.
;
; Bilingual (zh_TW / en_US, see electron-builder.yml's installerLanguages).
; Keep app-data cleanup opt-in: Utawakui is local-first, and uninstalling the
; binary should not silently erase user state. These sections appear as
; checkboxes on the uninstaller components page.

!include "FileFunc.nsh"
!include "installer-maintenance.nsh"

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
; The builder inserts this data-options page before the uninstall welcome.
!ifdef BUILD_UNINSTALLER
  !define MUI_PAGE_HEADER_TEXT "$(utaCleanupTitle)"
  !define MUI_PAGE_HEADER_SUBTEXT "$(utaCleanupSubtitle)"
  !define MUI_COMPONENTSPAGE_TEXT_TOP "$(utaCleanupText)"
!endif

!macro customHeader
  ; Keep native dialog sizing, with the same Windows CJK family as the app.
  SetFont /LANG=${LANG_TRADCHINESE} "Microsoft JhengHei UI" 9
  SetFont /LANG=${LANG_ENGLISH} "Segoe UI" 9
  DirText "$(utaDirectoryText)"
  !ifndef BUILD_UNINSTALLER
    !insertmacro utaMaintenanceStrings
  !endif

  LangString utaDirectoryText ${LANG_TRADCHINESE} "選擇 Utawakui 的安裝資料夾。"
  LangString utaDirectoryText ${LANG_ENGLISH} "Choose where to install Utawakui."

  LangString utaCleanupTitle ${LANG_TRADCHINESE} "選擇要刪除的資料"
  LangString utaCleanupTitle ${LANG_ENGLISH} "Choose data to delete"
  LangString utaCleanupSubtitle ${LANG_TRADCHINESE} "所有清理選項預設皆不勾選。"
  LangString utaCleanupSubtitle ${LANG_ENGLISH} "All cleanup options are unchecked by default."
  LangString utaCleanupText ${LANG_TRADCHINESE} "資料預設保留；刪除全部應用程式資料時，其中的工具、模型與曲庫也會刪除。"
  LangString utaCleanupText ${LANG_ENGLISH} "Data is kept by default. Deleting all app data also removes any tools, models and library files stored within it."

  LangString utaWelcomeTitle ${LANG_TRADCHINESE} "安裝 Utawakui"
  LangString utaWelcomeTitle ${LANG_ENGLISH} "Install Utawakui"

  LangString utaWelcomeText ${LANG_TRADCHINESE} "Utawakui 提供本機曲庫管理與播放控制。$\r$\n$\r$\n外部來源、線上歌詞、音訊處理與對外輸出，可在設定中另行啟用；所需工具與模型可依需求下載。$\r$\n$\r$\n解除安裝時，預設保留設定、已下載的工具與曲庫。"
  LangString utaWelcomeText ${LANG_ENGLISH} "Utawakui manages and plays your local music library.$\r$\n$\r$\nExternal sources, online lyrics, audio processing and public output can be enabled in Settings. Download their tools and models as needed.$\r$\nUninstalling keeps your settings, downloaded tools and library by default."

  LangString utaUnWelcomeTitle ${LANG_TRADCHINESE} "解除安裝 Utawakui"
  LangString utaUnWelcomeTitle ${LANG_ENGLISH} "Uninstall Utawakui"

  LangString utaUnWelcomeText ${LANG_TRADCHINESE} "將移除 Utawakui 應用程式與安裝快取。$\r$\n$\r$\n只有先前勾選的資料項目會一併刪除。刪除全部應用程式資料時，其中的工具、模型與曲庫也會刪除。$\r$\n若部分檔案仍被占用，可能需要重新啟動電腦才能完成清理。"
  LangString utaUnWelcomeText ${LANG_ENGLISH} "Utawakui and its installer cache will be removed.$\r$\n$\r$\nOnly the data options you selected will also be deleted. Deleting all app data includes any tools, models and library files stored within it.$\r$\nIf some files are in use, a restart may be needed to finish cleanup."

  LangString utaShortcutTitle ${LANG_TRADCHINESE} "安裝選項"
  LangString utaShortcutTitle ${LANG_ENGLISH} "Install options"

  LangString utaShortcutSubtitle ${LANG_TRADCHINESE} "選擇是否建立桌面捷徑。"
  LangString utaShortcutSubtitle ${LANG_ENGLISH} "Choose whether to create a desktop shortcut."

  LangString utaShortcutText ${LANG_TRADCHINESE} "將建立開始功能表捷徑。你也可以選擇建立桌面捷徑。"
  LangString utaShortcutText ${LANG_ENGLISH} "A Start Menu shortcut will be created. You can also add a desktop shortcut."

  LangString utaDesktopShortcut ${LANG_TRADCHINESE} "建立桌面捷徑"
  LangString utaDesktopShortcut ${LANG_ENGLISH} "Create a desktop shortcut"

  LangString utaSecDeps ${LANG_TRADCHINESE} "刪除已下載的工具與模型"
  LangString utaSecDeps ${LANG_ENGLISH} "Delete downloaded tools and models"

  LangString utaSecAppData ${LANG_TRADCHINESE} "刪除全部應用程式資料（含設定、快取、工具與模型）"
  LangString utaSecAppData ${LANG_ENGLISH} "Delete all app data (settings, cache, tools and models)"

  LangString utaSecLibrary ${LANG_TRADCHINESE} "刪除本機曲庫資料夾"
  LangString utaSecLibrary ${LANG_ENGLISH} "Delete local music library folder"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(utaWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(utaWelcomeText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !insertmacro utaMaintenancePage
  Var /GLOBAL utaShortcutOptionsPage
  Var /GLOBAL utaDesktopShortcutCheckbox
  Var /GLOBAL isNoDesktopShortcut

  Page custom utaShortcutOptionsPage utaShortcutOptionsLeave

  Function utaShortcutOptionsPage
    Call utaDetectInstalledVersion
    ${if} ${isUpdated}
    ${orIf} $utaInstallAction != "install"
      Abort
    ${endIf}

    !insertmacro MUI_HEADER_TEXT "$(utaShortcutTitle)" "$(utaShortcutSubtitle)"
    nsDialogs::Create 1018
    Pop $utaShortcutOptionsPage
    ${if} $utaShortcutOptionsPage == error
      Abort
    ${endIf}

    ${NSD_CreateLabel} 0u 0u 300u 36u "$(utaShortcutText)"
    Pop $0

    ${NSD_CreateCheckbox} 10u 52u 280u 16u "$(utaDesktopShortcut)"
    Pop $utaDesktopShortcutCheckbox
    ${if} $isNoDesktopShortcut == "true"
      SendMessage $utaDesktopShortcutCheckbox ${BM_SETCHECK} ${BST_UNCHECKED} 0
    ${else}
      SendMessage $utaDesktopShortcutCheckbox ${BM_SETCHECK} ${BST_CHECKED} 0
    ${endIf}

    nsDialogs::Show
  FunctionEnd

  Function utaShortcutOptionsLeave
    SendMessage $utaDesktopShortcutCheckbox ${BM_GETCHECK} 0 0 $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $isNoDesktopShortcut "false"
    ${else}
      StrCpy $isNoDesktopShortcut "true"
    ${endIf}
  FunctionEnd
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
  Var /GLOBAL LibraryCleanupSafe

  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallerLanguage"
  ${ifNot} $0 == ""
    StrCpy $LANGUAGE $0
  ${endIf}

  ; Electron's userData is always per-user, even for an all-users install —
  ; same reasoning as the SetShellVarContext calls in customUnInstall(Section)
  ; below.
  SetShellVarContext current

  StrCpy $LibraryDir ""
  StrCpy $LibraryCleanupSafe "false"
  ClearErrors
  FileOpen $1 "$APPDATA\Utawakui\library-path.txt" r
  ${ifNot} ${Errors}
    FileReadUTF16LE $1 $LibraryDir
    FileClose $1
    Call un.utaValidateLibraryCleanup
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
    RMDir /r /REBOOTOK "$APPDATA\Utawakui\dependencies"
  SectionEnd

  Section /o "un.$(utaSecAppData)" SEC_UN_APPDATA
    SetShellVarContext current
    RMDir /r /REBOOTOK "$APPDATA\Utawakui"
  SectionEnd

  ; Title is overwritten below once the real path is known (and the whole
  ; section hidden if there is none) — the placeholder here is never shown
  ; as-is.
  Section /o "un.$(utaSecLibrary)" SEC_UN_LIBRARY
    ; $LibraryDir came from a file on disk, i.e. untrusted input crossing a
    ; trust boundary. Revalidate the path and marker immediately before the
    ; destructive operation so a removed/replaced marker fails closed.
    Call un.utaValidateLibraryCleanup
    ${if} $LibraryCleanupSafe == "true"
      RMDir /r /REBOOTOK "$LibraryDir"
    ${endIf}
  SectionEnd

  Function un.utaValidateLibraryCleanup
    StrCpy $LibraryCleanupSafe "false"
    ${if} $LibraryDir != ""
      GetFullPathName $LibraryDir "$LibraryDir"
      ${GetRoot} $0 "$LibraryDir"
      ${GetParent} $2 "$LibraryDir"
      ${if} $LibraryDir != $0
      ${andIf} $2 != $0
      ${andIf} $LibraryDir != "$PROFILE"
      ${andIf} $LibraryDir != "$APPDATA"
      ${andIf} $LibraryDir != "$LOCALAPPDATA"
      ${andIf} $LibraryDir != "$DOCUMENTS"
      ${andIf} $LibraryDir != "$MUSIC"
      ${andIf} $LibraryDir != "$DESKTOP"
      ${andIf} $LibraryDir != "$INSTDIR"
      ${andIf} $LibraryDir != "$WINDIR"
      ${andIf} $LibraryDir != "$SYSDIR"
      ${andIf} $LibraryDir != "$PROGRAMFILES"
      ${andIf} $LibraryDir != "$PROGRAMFILES32"
      ${andIf} $LibraryDir != "$PROGRAMFILES64"
      ${andIf} $LibraryDir != "$COMMONFILES"
      ${andIf} $LibraryDir != "$COMMONFILES32"
      ${andIf} $LibraryDir != "$COMMONFILES64"
      ${andIf} $LibraryDir != "$TEMP"
        ClearErrors
        FileOpen $3 "$LibraryDir\.utawakui-library-owner-v2" r
        ${ifNot} ${Errors}
          StrCpy $4 ""
          ClearErrors
          FileRead $3 $4
          ${ifNot} ${Errors}
          ${andIf} $4 == "utawakui-dedicated-library-v2"
            StrCpy $LibraryCleanupSafe "true"
          ${endIf}
          FileClose $3
        ${endIf}
      ${endIf}
    ${endIf}
  FunctionEnd

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
    ${if} $LibraryCleanupSafe == "true"
    ${andIf} ${FileExists} "$LibraryDir\*.*"
      StrCpy $0 "$(utaSecLibrary) ($LibraryDir)"
      SectionSetText ${SEC_UN_LIBRARY} $0
    ${else}
      SectionSetText ${SEC_UN_LIBRARY} ""
    ${endIf}
  FunctionEnd
!macroend
