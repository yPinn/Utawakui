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
  !define MUI_WELCOMEPAGE_TITLE "安裝 Utawakui"
  !define MUI_WELCOMEPAGE_TEXT "此安裝器會安裝 Utawakui 的核心功能：本機曲庫、播放、匯入入口、設定與功能啟用介面，並建立開始功能表與桌面捷徑。$\r$\n$\r$\n外部來源、歌詞來源、音訊處理與對外輸出屬於進階功能。安裝完成後，可在 Utawakui 的設定頁啟用並準備；需要時才會連線、下載工具或模型，或在本機產生處理結果。$\r$\n$\r$\n解除安裝預設只移除應用程式。設定、已下載的功能資料與你的曲庫不會自動刪除；需要清除時可在解除安裝時勾選。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !ifdef MUI_WELCOMEPAGE_TITLE
    !undef MUI_WELCOMEPAGE_TITLE
  !endif
  !ifdef MUI_WELCOMEPAGE_TEXT
    !undef MUI_WELCOMEPAGE_TEXT
  !endif
  !define MUI_WELCOMEPAGE_TITLE "解除安裝 Utawakui"
  !define MUI_WELCOMEPAGE_TEXT "解除安裝會移除 Utawakui 應用程式。$\r$\n$\r$\n預設會保留設定、已下載的功能資料與你的本機曲庫。若要刪除這台電腦上的 Utawakui 應用程式資料，請在下一步勾選清理選項。$\r$\n$\r$\n若資料夾正由檔案總管或系統暫時使用，清理可能會在重開機後完成。你的音樂曲庫資料夾不會由解除安裝器自動刪除。"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstallSection
  Section /o "un.清除 Utawakui 設定與功能資料 (%APPDATA%\Utawakui)" SEC_UN_CLEAN_UTAWAKUI_DATA
    ; Electron userData is per-user even for all-users installs.
    SetShellVarContext current
    RMDir /r /REBOOTOK "$APPDATA\Utawakui"
  SectionEnd

  Section /o "un.清除舊版殘留資料 (%APPDATA%\Electron)" SEC_UN_CLEAN_LEGACY_ELECTRON_DATA
    ; Covers pre-fix builds/dev runs that wrote under Electron's default name.
    SetShellVarContext current
    RMDir /r /REBOOTOK "$APPDATA\Electron"
  SectionEnd
!macroend
