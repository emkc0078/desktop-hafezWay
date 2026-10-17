@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Hafez Way Admin - Emergency Direct Update / تحديث الطوارئ

echo ========================================================
echo   Hafez Way Admin - Emergency Direct Update Script
echo   تحديث الطوارئ واستبدال الملفات مباشرة - حافظ وي
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%emergency-update.ps1" (
    set "PS_SCRIPT=%SCRIPT_DIR%emergency-update.ps1"
) else if exist "%SCRIPT_DIR%scripts\emergency-update.ps1" (
    set "PS_SCRIPT=%SCRIPT_DIR%scripts\emergency-update.ps1"
) else (
    echo [ERROR] emergency-update.ps1 not found in %SCRIPT_DIR%
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% NEQ 0 (
    echo.
    echo [!] فشل التحديث أو حدث خطأ أثناء فك الملفات.
    pause
) else (
    echo.
    echo إغلاق النافذة خلال 5 ثوان...
    timeout /t 5 >nul
)

exit /b %EXIT_CODE%
