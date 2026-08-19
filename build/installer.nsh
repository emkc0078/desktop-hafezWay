; Request highest available privileges so taskkill can close any running instance,
; even if it was launched by a different user or with elevation.
RequestExecutionLevel admin

!macro customInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  ; /F  = force-terminate
  ; /T  = kill the whole process tree (child processes too)
  ; /IM = match by image name
  nsExec::ExecToLog 'taskkill /F /T /IM "Hafez Way Admin.exe"'
  ; Wait for the OS to release all file locks before the installer copies files.
  Sleep 2000
!macroend

!macro customUnInstall
  DetailPrint "Closing any running instance of Hafez Way Admin..."
  nsExec::ExecToLog 'taskkill /F /T /IM "Hafez Way Admin.exe"'
  Sleep 1000
!macroend
