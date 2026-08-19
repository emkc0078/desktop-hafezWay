; Force-close any running instance before the installer copies files.
; Admin elevation is handled via win.requestedExecutionLevel in package.json.

!macro customInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::ExecToLog 'taskkill /F /T /IM "Hafez Way Admin.exe"'
  Sleep 2000
!macroend

!macro customUnInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::ExecToLog 'taskkill /F /T /IM "Hafez Way Admin.exe"'
  Sleep 1000
!macroend
