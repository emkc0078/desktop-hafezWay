# ====================================================================
# Hafez Way Admin - Emergency Manual Update & Extraction Script
# سكريبت الطوارئ لتحديث الداشبورد وفك الضغط واستبدال الملفات مباشرة
# ====================================================================

param(
    [string]$InstallerPath = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   حافظ وي - سكريبت التحديث الطارئ واستبدال الملفات" -ForegroundColor Yellow
Write-Host "   Hafez Way Admin - Emergency Direct Update Script" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Force-kill running instances
Write-Host "[1/5] جاري إغلاق أي عمليات جارية للبرنامج..." -ForegroundColor Cyan
Write-Host "      Closing any running instances of Hafez Way Admin..." -ForegroundColor Gray

$processNames = @("Hafez Way Admin", "Hafez Way Admin Setup", "Hafez-Way-Admin-Setup", "desktop-hafezway-admin")
foreach ($proc in $processNames) {
    Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
# Also taskkill by image name to ensure complete termination of process tree
Start-Process -FilePath "taskkill.exe" -ArgumentList "/F /T /IM `"Hafez Way Admin.exe`"" -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue 2>$null
Start-Sleep -Seconds 1
Write-Host "      ✓ تم إغلاق البرنامج وتحرير الملفات." -ForegroundColor Green

# 2. Determine target install directory
Write-Host "[2/5] تحديد مجلد تثبيت البرنامج..." -ForegroundColor Cyan
$installDir = "$env:LOCALAPPDATA\Programs\desktop-hafezway-admin"
if (-not (Test-Path $installDir)) {
    if (Test-Path "$env:LOCALAPPDATA\Programs\Hafez Way Admin") {
        $installDir = "$env:LOCALAPPDATA\Programs\Hafez Way Admin"
    } else {
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    }
}
Write-Host "      ✓ مسار التثبيت: $installDir" -ForegroundColor Green

# 3. Locate the latest installer if not passed
Write-Host "[3/5] البحث عن ملف التثبيت الجديد..." -ForegroundColor Cyan
if (-not $InstallerPath -or -not (Test-Path $InstallerPath)) {
    $searchDirs = @(
        (Join-Path $env:USERPROFILE "Downloads"),
        (Get-Location).Path,
        $PSScriptRoot
    )
    $candidate = $null
    foreach ($dir in $searchDirs) {
        if ($dir -and (Test-Path $dir)) {
            $found = Get-ChildItem -Path $dir -Filter "*Hafez*Admin*Setup*.exe" -File -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($found) {
                $candidate = $found.FullName
                break
            }
        }
    }
    if ($candidate) {
        $InstallerPath = $candidate
    }
}

if (-not $InstallerPath -or -not (Test-Path $InstallerPath)) {
    Write-Host "      [!] لم يتم العثور على ملف التثبيت تلقائياً في التنزيلات." -ForegroundColor Yellow
    Write-Host "      يرجى سحب ملف التثبيت وإفلاته هنا ثم الضغط على Enter:" -ForegroundColor Yellow
    $userInput = Read-Host "      مسار ملف التثبيت (Installer Path)"
    $InstallerPath = $userInput.Trim('"', "'", " ")
    if (-not (Test-Path $InstallerPath)) {
        Write-Host "      [خطأ] لم يتم العثور على الملف: $InstallerPath" -ForegroundColor Red
        exit 1
    }
}

Write-Host "      ✓ تم العثور على ملف التثبيت: $InstallerPath" -ForegroundColor Green

# 4. Extraction / File Replacement
Write-Host "[4/5] فك ضغط واستبدال ملفات الإصدار الجديد..." -ForegroundColor Cyan

# Find 7-Zip executable
$7z = $null
$possible7z = @(
    "7z",
    "$env:ProgramFiles\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
)
foreach ($p in $possible7z) {
    if ($p -eq "7z") {
        $cmd = Get-Command 7z -ErrorAction SilentlyContinue
        if ($cmd) { $7z = $cmd.Source; break }
    } elseif (Test-Path $p) {
        $7z = $p
        break
    }
}

# Find WinRAR executable
$winrar = $null
$possibleWinrar = @(
    "$env:ProgramFiles\WinRAR\WinRAR.exe",
    "${env:ProgramFiles(x86)}\WinRAR\WinRAR.exe"
)
foreach ($w in $possibleWinrar) {
    if (Test-Path $w) { $winrar = $w; break }
}

$extractedSuccessfully = $false
$tempExtract = Join-Path $env:TEMP "hafezway_emergency_update_$(Get-Random)"

if ($7z) {
    Write-Host "      استخدام 7-Zip لفك محتويات المثبت واستخراج الملفات..." -ForegroundColor Gray
    try {
        New-Item -ItemType Directory -Path "$tempExtract\stage1" -Force | Out-Null
        # Extract outer NSIS installer
        & $7z x "$InstallerPath" "-o$tempExtract\stage1" -y | Out-Null
        
        # Look for app-64.7z inside
        $appArchive = Get-ChildItem -Path "$tempExtract\stage1" -Filter "app-*.7z" -Recurse -File | Select-Object -First 1
        if ($appArchive) {
            New-Item -ItemType Directory -Path "$tempExtract\app" -Force | Out-Null
            & $7z x "$($appArchive.FullName)" "-o$tempExtract\app" -y | Out-Null
            
            # Copy all files from $tempExtract\app directly to $installDir
            Copy-Item -Path "$tempExtract\app\*" -Destination $installDir -Recurse -Force
            $extractedSuccessfully = $true
            Write-Host "      ✓ تم فك الضغط واستبدال الملفات عبر 7-Zip بنجاح!" -ForegroundColor Green
        }
    } catch {
        Write-Host "      تعذر الاستخراج بـ 7-Zip: $_" -ForegroundColor Yellow
    }
} elseif ($winrar) {
    Write-Host "      استخدام WinRAR لفك محتويات المثبت..." -ForegroundColor Gray
    try {
        New-Item -ItemType Directory -Path "$tempExtract\stage1" -Force | Out-Null
        & $winrar x -ibck -inul "$InstallerPath" "$tempExtract\stage1\"
        $appArchive = Get-ChildItem -Path "$tempExtract\stage1" -Filter "app-*.7z" -Recurse -File | Select-Object -First 1
        if ($appArchive) {
            New-Item -ItemType Directory -Path "$tempExtract\app" -Force | Out-Null
            & $winrar x -ibck -inul "$($appArchive.FullName)" "$tempExtract\app\"
            Copy-Item -Path "$tempExtract\app\*" -Destination $installDir -Recurse -Force
            $extractedSuccessfully = $true
            Write-Host "      ✓ تم فك الضغط واستبدال الملفات عبر WinRAR بنجاح!" -ForegroundColor Green
        }
    } catch {
        Write-Host "      تعذر الاستخراج بـ WinRAR: $_" -ForegroundColor Yellow
    }
}

# If extraction tools were not found or failed, execute silent installation
if (-not $extractedSuccessfully) {
    Write-Host "      تشغيل المثبت في الوضع الصامت الصريح (/S) لتحديث الملفات مباشرة..." -ForegroundColor Gray
    try {
        $proc = Start-Process -FilePath "$InstallerPath" -ArgumentList "/S", "/D=$installDir" -PassThru -Wait
        Start-Sleep -Seconds 2
        $extractedSuccessfully = $true
        Write-Host "      ✓ تم تحديث الملفات بنجاح عبر التثبيت الصامت!" -ForegroundColor Green
    } catch {
        Write-Host "      [خطأ] تعذر التثبيت: $_" -ForegroundColor Red
        exit 1
    }
}

# Cleanup temp
if (Test-Path $tempExtract) {
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
}

# 5. Launch the application
Write-Host "[5/5] تشغيل البرنامج بالإصدار الجديد..." -ForegroundColor Cyan
$mainExe = Join-Path $installDir "Hafez Way Admin.exe"
if (Test-Path $mainExe) {
    Start-Process -FilePath $mainExe
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   ✓ اكتمل التحديث بنجاح وتم تشغيل البرنامج الجديد!" -ForegroundColor Green
    Write-Host "   ✓ Update completed successfully. App has been launched!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "      [تنبيه] لم يتم العثور على الملف التنفيذي في: $mainExe" -ForegroundColor Yellow
}
