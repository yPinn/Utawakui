; Custom NSIS hooks for electron-builder.
;
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

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "安裝 Utawakui 核心應用程式"
  !define MUI_WELCOMEPAGE_TEXT "此安裝器會安裝 Utawakui 核心應用程式：本機曲庫、播放、匯入入口、設定與功能啟用介面。$\r$\n$\r$\n進階工作流程，例如外部來源、歌詞來源、音訊處理與對外輸出，屬於 Utawakui 內的「工作流程擴充」。需要時會先由 Utawakui 顯示功能啟用說明，再連線、下載或產生相依內容。$\r$\n$\r$\n建議先完成核心安裝，再於 Utawakui 內啟用需要的工作流程擴充。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnInstallSection
  Section /o "un.清理 Utawakui 使用者資料 (%APPDATA%\Utawakui)" SEC_UN_CLEAN_UTAWAKUI_DATA
    ; Electron userData is per-user even for all-users installs.
    SetShellVarContext current
    RMDir /r "$APPDATA\Utawakui"
  SectionEnd

  Section /o "un.清理舊版 Electron 資料夾 (%APPDATA%\Electron)" SEC_UN_CLEAN_LEGACY_ELECTRON_DATA
    ; Covers pre-fix builds/dev runs that wrote under Electron's default name.
    SetShellVarContext current
    RMDir /r "$APPDATA\Electron"
  SectionEnd
!macroend
