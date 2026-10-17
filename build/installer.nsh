; Force-close any running instance before the installer copies or uninstalls files.
; customInit runs in .onInit before uninstallOldVersion is called.
; customUnInit runs in un.onInit before uninstaller removes files.

!macro customInit
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::Exec '$SYSDIR\taskkill.exe /F /T /IM "Hafez Way Admin.exe"'
  Sleep 1500
!macroend

!macro customUnInit
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::Exec '$SYSDIR\taskkill.exe /F /T /IM "Hafez Way Admin.exe"'
  Sleep 1500
!macroend

!macro customInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::Exec '$SYSDIR\taskkill.exe /F /T /IM "Hafez Way Admin.exe"'
  Sleep 1500
!macroend

!macro customUnInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::Exec '$SYSDIR\taskkill.exe /F /T /IM "Hafez Way Admin.exe"'
  Sleep 1000
!macroend

