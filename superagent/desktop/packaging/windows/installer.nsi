; Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
; SPDX-License-Identifier: AGPL-3.0
;
; The Windows installer for the OpenViking SuperAgent desktop shell. It asks for
; one thing: where to put the program. It installs for the current user, so it
; never asks for administrator rights and never touches another account.
;
;   makensis /DVERSION=0.1.0 /DSOURCE=dist\windows\ovsa-desktop.exe installer.nsi

Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SOURCE
  !define SOURCE "ovsa-desktop.exe"
!endif

Name "OpenViking SuperAgent"
OutFile "ovsa-desktop-${VERSION}-win32-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\OpenViking SuperAgent"
InstallDirRegKey HKCU "Software\OpenViking\SuperAgentDesktop" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "安装 OpenViking SuperAgent"
!define MUI_WELCOMEPAGE_TEXT "这个程序只装一个桌面入口：打开它就是本机 OpenViking SuperAgent 的控制台。$\r$\n$\r$\n运行时和配置仍然放在 %USERPROFILE%\.ov-superagent，和命令行安装完全一样；第一次打开时会带你安装或进入 setup。"
!define MUI_DIRECTORYPAGE_TEXT_TOP "选择程序安装到哪里。运行时数据不在这里，不会因为换目录而丢失。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\ovsa-desktop.exe"
!define MUI_FINISHPAGE_RUN_TEXT "现在打开 OpenViking SuperAgent"
!define MUI_FINISHPAGE_TEXT "装好了。运行时（~\.ov-superagent）如果已经存在，会直接连上；没有的话，窗口会带你安装并完成 setup。"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "OpenViking SuperAgent"
VIAddVersionKey "FileDescription" "OpenViking SuperAgent desktop shell"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Beijing Volcano Engine Technology Co., Ltd."

Section "OpenViking SuperAgent" SecMain
  SetOutPath "$INSTDIR"
  File "${SOURCE}"

  CreateDirectory "$SMPROGRAMS\OpenViking SuperAgent"
  CreateShortcut "$SMPROGRAMS\OpenViking SuperAgent\OpenViking SuperAgent.lnk" "$INSTDIR\ovsa-desktop.exe"
  CreateShortcut "$DESKTOP\OpenViking SuperAgent.lnk" "$INSTDIR\ovsa-desktop.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\OpenViking\SuperAgentDesktop" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent" "DisplayName" "OpenViking SuperAgent"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent" "Publisher" "Beijing Volcano Engine Technology Co., Ltd."
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\ovsa-desktop.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\OpenViking SuperAgent\OpenViking SuperAgent.lnk"
  RMDir "$SMPROGRAMS\OpenViking SuperAgent"
  Delete "$DESKTOP\OpenViking SuperAgent.lnk"
  DeleteRegKey HKCU "Software\OpenViking\SuperAgentDesktop"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenVikingSuperAgent"
  ; The runtime under %USERPROFILE%\.ov-superagent is the user's data and is kept.
SectionEnd
