# LibreTV App - One-click APK Build (PowerShell, ASCII-only, crash-proof)
# Double-click build_apk.bat, or run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File build_apk.ps1

$ErrorActionPreference = 'Stop'

# Never auto-close: resolve script dir, do not rely on caller cwd
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Definition }
Set-Location $root

function Say([string]$m) { Write-Host $m }
function Fail([string]$m) {
    Write-Host "[ERROR] $m" -ForegroundColor Red
    try { Read-Host 'Press Enter to continue' } catch {}
    exit 1
}

try {
    Say '============================================'
    Say '  LibreTV App - One-click APK Build'
    Say "  Root: $root"
    Say '============================================'
    Say ''

    # ---- 1. Java (JDK 17+) ----
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if (-not $javaCmd) {
        $candidates = @(
            'C:\Program Files\Android\Android Studio\jbr\bin\java.exe',
            "$env:LOCALAPPDATA\Android Studio\jbr\bin\java.exe",
            "$env:LOCALAPPDATA\Programs\Android Studio\jbr\bin\java.exe',
            'C:\Program Files\Eclipse Adoptium',
            'C:\Program Files\Microsoft'
        )
        $found = $null
        foreach ($c in $candidates) {
            if (Test-Path $c) {
                if ($c -like '*\bin\java.exe') { $found = $c; break }
                $j = Get-ChildItem $c -Recurse -Filter java.exe -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($j) { $found = $j.FullName; break }
            }
        }
        if ($found) {
            $env:JAVA_HOME = Split-Path (Split-Path $found)
            $env:Path = "$env:JAVA_HOME\bin;$env:Path"
            Say "[OK] Java (auto-detected): $found"
        } else {
            Fail 'Java (JDK 17+) not found. Install Android Studio or Temurin JDK 17+ and retry.'
        }
    } else {
        Say "[OK] Java (PATH): $($javaCmd.Source)"
    }
    $javaVersion = (& java -version 2>&1 | Select-Object -First 1)
    Say "      version: $javaVersion"

    # ---- 2. Android SDK ----
    if (-not $env:ANDROID_HOME) {
        $sdk = "$env:LOCALAPPDATA\Android\Sdk"
        if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk } else { Fail 'Android SDK not found. Set ANDROID_HOME env var.' }
    }
    Say "[OK] ANDROID_HOME=$env:ANDROID_HOME"

    # ---- 3. Rewrite local.properties with real SDK path ----
    Set-Content -Path 'android\local.properties' -Value ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\', '/')) -Encoding Ascii
    Say '[OK] android\local.properties updated'

    # ---- 4. Optional: sync latest web layer ----
    $syncWeb = Read-Host 'Sync latest LibreTV web layer first? (Y/N, default N)'
    if ($syncWeb -eq 'Y' -or $syncWeb -eq 'y') {
        npm run sync:web
        if ($LASTEXITCODE -ne 0) { Say '[WARN] sync:web failed, continue with existing www' }
    }

    # ---- 5. cap sync ----
    Say 'Running npx cap sync ...'
    npx cap sync
    if ($LASTEXITCODE -ne 0) { Fail 'cap sync failed' }

    # ---- 6. Pick build type by keystore ----
    $buildType = 'assembleDebug'
    if (Test-Path 'android\app\libretv-release.keystore') {
        $buildType = 'assembleRelease'
        Say '[INFO] release keystore found, building Release'
    } else {
        Say '[INFO] no release keystore, building Debug (installable for testing)'
    }

    # ---- 7. Gradle build (log to file, then replay to console) ----
    Say "Building $buildType ... (first run downloads Gradle deps, can take several minutes)"
    Say 'Build running, output will appear below when finished...'
    Push-Location 'android'
    & .\gradlew.bat $buildType --no-daemon *> '..\build_log.txt'
    $code = $LASTEXITCODE
    Pop-Location

    Say ''
    Say '----- Gradle output (full) -----'
    Get-Content 'build_log.txt' | ForEach-Object { Write-Host $_ }
    Say '---------------------------------'

    if ($code -ne 0) {
        Write-Host ''
        Write-Host '[ERROR] Build failed (exit code ' + $code + ').' -ForegroundColor Red
        Write-Host 'Full log saved to build_log.txt'
        Write-Host 'Quick checks: JDK 17/21 installed, sdk.dir is a real path, network reachable for Gradle download.'
        Fail 'Build failed, see log above'
    }

    $apk = if ($buildType -eq 'assembleRelease') { 'android\app\build\outputs\apk\release\app-release.apk' } else { 'android\app\build\outputs\apk\debug\app-debug.apk' }
    Say '============================================'
    Say "Build OK: $apk"
    Say 'Note: APK is inside debug/ or release/ subfolder, not apk root'
    Say '============================================'
    Read-Host 'Press Enter to exit'
}
catch {
    Write-Host ''
    Write-Host '[FATAL] Unexpected error (script aborted):' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray }
    try { Read-Host 'Press Enter to continue' } catch {}
    exit 1
}
