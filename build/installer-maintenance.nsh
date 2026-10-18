; Local-only maintenance for the same complete installer. No feed or download.
!include "WordFunc.nsh"

!macro utaMaintenanceStrings
  LangString utaReinstallTitle ${LANG_TRADCHINESE} "重新安裝 Utawakui"
  LangString utaReinstallTitle ${LANG_ENGLISH} "Reinstall Utawakui"
  LangString utaUpdateTitle ${LANG_TRADCHINESE} "更新 Utawakui"
  LangString utaUpdateTitle ${LANG_ENGLISH} "Update Utawakui"
  LangString utaMaintenanceSubtitle ${LANG_TRADCHINESE} "使用此安裝包重新安裝程式檔案。"
  LangString utaMaintenanceSubtitle ${LANG_ENGLISH} "Install the program files from this installer."
  LangString utaMaintenanceVersions ${LANG_TRADCHINESE} "已安裝版本：$utaInstalledVersion$\r$\n此安裝包版本：${VERSION}"
  LangString utaMaintenanceVersions ${LANG_ENGLISH} "Installed version: $utaInstalledVersion$\r$\nInstaller version: ${VERSION}"
  LangString utaMaintenanceText ${LANG_TRADCHINESE} "將替換安裝資料夾內的程式檔案。儲存在該資料夾以外的設定、曲庫、工具與模型會保留。$\r$\n$\r$\n這項操作可補回遺失或損壞的程式檔案，不會重設設定或修復另行下載的工具與模型。"
  LangString utaMaintenanceText ${LANG_ENGLISH} "Program files in the installation folder will be replaced. Settings, library files, tools and models stored outside that folder are kept.$\r$\n$\r$\nThis can replace missing or damaged program files. It does not reset settings or repair separately downloaded tools or models."
  LangString utaReinstallAction ${LANG_TRADCHINESE} "重新安裝"
  LangString utaReinstallAction ${LANG_ENGLISH} "Reinstall"
  LangString utaUpdateAction ${LANG_TRADCHINESE} "更新"
  LangString utaUpdateAction ${LANG_ENGLISH} "Update"
  LangString utaOlderInstaller ${LANG_TRADCHINESE} "此安裝包版本較舊，無法覆蓋已安裝的較新版本。請使用相同或較新版本的安裝包。"
  LangString utaOlderInstaller ${LANG_ENGLISH} "This installer is older than the installed version. Use an installer for the same or a newer version."
!macroend

!macro customInit
  ; Silent installers skip page callbacks. Block downgrades before any removal.
  ${if} ${Silent}
    ; Match the standard install section's final silent scope, including the
    ; case where both per-user and all-users installations are registered.
    ${if} $hasPerMachineInstallation == "1"
      !insertmacro setInstallModePerAllUsers
    ${endif}
    Call utaGuardInstallerVersion
  ${endif}
!macroend

!macro utaMaintenancePage
  Var /GLOBAL utaInstalledVersion
  Var /GLOBAL utaInstallAction
  Var /GLOBAL utaMaintenanceDialog

  ; The standard template sets instFilesPre just before this hook. Preserve
  ; its directory normalization, then validate again in the final chosen scope.
  !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !define MUI_PAGE_CUSTOMFUNCTION_PRE utaMaintenanceInstFilesPre

  Page custom utaMaintenancePageShow

  Function utaDetectInstalledVersion
    Push $0
    Push $1
    StrCpy $utaInstallAction "install"
    ReadRegStr $utaInstalledVersion SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ; An all-users installation also replaces an existing current-user copy.
    ${if} $installMode == "all"
      ReadRegStr $1 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
      ${if} $utaInstalledVersion == ""
        StrCpy $utaInstalledVersion $1
      ${elseif} $1 != ""
        ${VersionCompare} $1 $utaInstalledVersion $0
        ${if} $0 == 1
          StrCpy $utaInstalledVersion $1
        ${endif}
      ${endif}
    ${endif}
    ${if} $utaInstalledVersion != ""
      ${VersionCompare} "${VERSION}" $utaInstalledVersion $0
      ${if} $0 == 0
        StrCpy $utaInstallAction "reinstall"
      ${elseif} $0 == 1
        StrCpy $utaInstallAction "update"
      ${else}
        StrCpy $utaInstallAction "older"
      ${endif}
    ${endif}
    Pop $1
    Pop $0
    ClearErrors
  FunctionEnd

  Function utaGuardInstallerVersion
    Call utaDetectInstalledVersion
    ${if} $utaInstallAction == "older"
      IfSilent +2
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(utaOlderInstaller)"
      SetErrorLevel 2
      Quit
    ${endif}
  FunctionEnd

  Function utaMaintenanceInstFilesPre
    Call instFilesPre
    Call utaGuardInstallerVersion
  FunctionEnd

  Function utaMaintenancePageShow
    Call utaGuardInstallerVersion
    ${if} $utaInstallAction == "install"
    ${orIf} ${isUpdated}
      Abort
    ${endif}
    ${if} $utaInstallAction == "reinstall"
      !insertmacro MUI_HEADER_TEXT "$(utaReinstallTitle)" "$(utaMaintenanceSubtitle)"
    ${else}
      !insertmacro MUI_HEADER_TEXT "$(utaUpdateTitle)" "$(utaMaintenanceSubtitle)"
    ${endif}
    nsDialogs::Create 1018
    Pop $utaMaintenanceDialog
    ${if} $utaMaintenanceDialog == error
      Abort
    ${endif}
    ${NSD_CreateLabel} 0u 0u 300u 32u "$(utaMaintenanceVersions)"
    Pop $0
    ${NSD_CreateLabel} 0u 44u 300u 86u "$(utaMaintenanceText)"
    Pop $0
    ${if} $utaInstallAction == "reinstall"
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(utaReinstallAction)"
    ${else}
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(utaUpdateAction)"
    ${endif}
    nsDialogs::Show
  FunctionEnd
!macroend
