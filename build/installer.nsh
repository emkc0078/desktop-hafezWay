; Auto-close any running instance of the app before installing/uninstalling.
; This runs silently so the user never sees the "cannot be closed" dialog.

!macro customInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::ExecToLog 'taskkill /F /IM "Hafez Way Admin.exe" /T'
  ; Give the OS a moment to release file locks before the installer proceeds.
  Sleep 1500
!macroend

!macro customUnInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::ExecToLog 'taskkill /F /IM "Hafez Way Admin.exe" /T'
  Sleep 1000
!macroend
