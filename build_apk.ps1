# LibreTV App - One-click APK Build (ASCII-only, single-quote only, crash-proof)
#
# Toolchain of this project: Capacitor 6 + AGP 8.2.1 + Gradle 8.2.1
#   - Gradle 8.2.1 can only RUN on JDK 17 / 18 / 19 (JDK 21 needs 8.5, JDK 25 needs 9.1)
#   => JDK 17 is the only safe choice.
#
# This script self-provisions everything, WITHOUT installing anything into Windows:
#   .jdk\          portable JDK 17       (about 180 MB, one time)
#   .android-sdk\  minimal Android SDK   (about 120 MB, one time)
# Both folders live inside the project and are git-ignored.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Definition }
Set-Location $root

function Say([string]$m) { Write-Host $m }

function Fail([string]$m) {
    Write-Host ('[ERROR] ' + $m) -ForegroundColor Red
    try { Read-Host 'Press Enter to continue' } catch {}
    exit 1
}

function Fetch([string[]]$urls, [string]$dest, [long]$minBytes) {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    foreach ($u in $urls) {
        Say ('    downloading: ' + $u)
        try {
            if (Test-Path $dest) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add('User-Agent', 'Mozilla/5.0')
            $wc.DownloadFile($u, $dest)
            $wc.Dispose()
            if ((Test-Path $dest) -and ((Get-Item $dest).Length -ge $minBytes)) {
                Say ('    downloaded ' + [math]::Round((Get-Item $dest).Length / 1MB) + ' MB')
                return $true
            }
            Say '    [WARN] file too small (probably 404), trying next mirror'
        } catch {
            Say ('    [WARN] mirror failed: ' + $_.Exception.Message)
        }
    }
    return $false
}

# Extract a zip into $target. If the zip has exactly one top-level folder,
# that folder's content becomes $target (handles build-tools zips whose top
# folder is named 'android-14' instead of the version number).
function UnzipTop([string]$zip, [string]$target) {
    $tmp = $target + '.tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)

    $parent = Split-Path $target -Parent
    if ($parent -and (-not (Test-Path $parent))) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    if (Test-Path $target) { Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue }

    $items = @(Get-ChildItem $tmp -Force)
    if (($items.Count -eq 1) -and ($items[0].PSIsContainer)) {
        Move-Item -LiteralPath $items[0].FullName -Destination $target
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Move-Item -LiteralPath $tmp -Destination $target
    }
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
}

function Get-JavaMajor([string]$javaExe) {
    try {
        $out = (cmd /c ('"' + $javaExe + '" -version 2>&1') | Out-String)
        if ($out -match 'version "(\d+)(?:\.(\d+))?') {
            $maj = [int]$Matches[1]
            if ($maj -eq 1 -and $Matches[2]) { $maj = [int]$Matches[2] }
            return $maj
        }
    } catch {}
    return 0
}

function Find-LocalPortableJdk([string]$jdkRoot) {
    if (-not (Test-Path $jdkRoot)) { return $null }
    $dirs = Get-ChildItem $jdkRoot -Directory -ErrorAction SilentlyContinue
    foreach ($d in $dirs) {
        $exe = Join-Path $d.FullName 'bin\java.exe'
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

function Install-PortableJdk17([string]$jdkRoot) {
    if (-not (Test-Path $jdkRoot)) { New-Item -ItemType Directory -Path $jdkRoot -Force | Out-Null }
    $zip = Join-Path $jdkRoot 'jdk17.zip'

    $urls = @()
    $urls += 'https://mirrors.huaweicloud.com/openjdk/17.0.2/openjdk-17.0.2_windows-x64_bin.zip'
    try {
        $listUrl = 'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/'
        $html = (New-Object System.Net.WebClient).DownloadString($listUrl)
        $mm = [regex]::Matches($html, 'OpenJDK17U-jdk_x64_windows_hotspot_[0-9._+]+\.zip')
        if ($mm.Count -gt 0) { $urls += ($listUrl + $mm[$mm.Count - 1].Value) }
    } catch {}
    $urls += 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse'

    if (-not (Fetch $urls $zip 50000000)) { return $null }

    Get-ChildItem $jdkRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Say '    extracting (about 1 minute) ...'
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $jdkRoot)
    } catch {
        Say ('    [WARN] extract failed: ' + $_.Exception.Message)
        return $null
    }
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    return (Find-LocalPortableJdk $jdkRoot)
}

# ---- Android SDK provisioning -------------------------------------------
# Do NOT hard-code archive names: Google renames them (API 34 platform is
# actually 'platform-34-ext7_r03.zip', not 'platform-34_r03.zip').
# Read the official repository index at runtime and resolve real file names.

function Get-SdkRepoXml() {
    $bases = @(
        'https://mirrors.cloud.tencent.com/AndroidSDK/',
        'https://dl.google.com/android/repository/'
    )
    foreach ($b in $bases) {
        foreach ($f in @('repository2-3.xml', 'repository2-2.xml')) {
            try {
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add('User-Agent', 'Mozilla/5.0')
                $txt = $wc.DownloadString($b + $f)
                $wc.Dispose()
                if ($txt -and $txt.Length -gt 20000) {
                    $doc = New-Object System.Xml.XmlDocument
                    $doc.LoadXml($txt)
                    return $doc
                }
            } catch {}
        }
    }
    return $null
}

# Returns archive file names for a package path (newest / non-obsolete first).
function Resolve-ArchiveNames($doc, [string]$pkgPath) {
    $good = @()
    $old = @()
    if (-not $doc) { return @() }
    try {
        foreach ($n in $doc.GetElementsByTagName('remotePackage')) {
            if ($n.GetAttribute('path') -ne $pkgPath) { continue }
            $isOld = ($n.GetAttribute('obsolete') -eq 'true')
            foreach ($a in $n.GetElementsByTagName('archive')) {
                $os = ''
                $ho = $a.GetElementsByTagName('host-os')
                if ($ho.Count -gt 0) { $os = $ho[0].InnerText }
                if ($os -ne '' -and $os -ne 'windows') { continue }
                $uu = $a.GetElementsByTagName('url')
                if ($uu.Count -gt 0) {
                    if ($isOld) { $old += $uu[0].InnerText } else { $good += $uu[0].InnerText }
                }
            }
        }
    } catch {}
    return @(@($good + $old) | Select-Object -Unique)
}

function Sdk-Urls([string[]]$files) {
    $bases = @(
        'https://mirrors.cloud.tencent.com/AndroidSDK/',
        'https://dl.google.com/android/repository/'
    )
    $out = @()
    foreach ($f in $files) {
        if (-not $f) { continue }
        foreach ($b in $bases) { $out += ($b + $f) }
    }
    return @($out | Select-Object -Unique)
}

function Test-SdkComplete([string]$sdkRoot) {
    if (-not (Test-Path (Join-Path $sdkRoot 'platforms\android-34\android.jar'))) { return $false }
    $bt = Join-Path $sdkRoot 'build-tools'
    if (-not (Test-Path $bt)) { return $false }
    $aapt = @(Get-ChildItem $bt -Recurse -Filter 'aapt2.exe' -ErrorAction SilentlyContinue)
    if ($aapt.Count -eq 0) { return $false }
    return $true
}

function Write-SdkLicenses([string]$sdkRoot) {
    $licDir = Join-Path $sdkRoot 'licenses'
    if (-not (Test-Path $licDir)) { New-Item -ItemType Directory -Path $licDir -Force | Out-Null }
    $lic = @(
        '8933bad161af4178b1185d1a37fbf41ea5269c55',
        'd56f5187479451eabf01fb78af6dfcb131a6481e',
        '24333f8a63b6825ea9c5514f83c2829b004d1fee'
    )
    Set-Content -Path (Join-Path $licDir 'android-sdk-license') -Value $lic -Encoding Ascii
    Set-Content -Path (Join-Path $licDir 'android-sdk-preview-license') -Value '84831b9409646a918e30573bab4c9c91346d8abd' -Encoding Ascii
}

# Plan A: download the three component zips directly (fast, mirror friendly).
function Install-SdkDirect([string]$sdkRoot, $doc) {
    $tmpZip = Join-Path $sdkRoot '_download.zip'

    $plDir = Join-Path $sdkRoot 'platforms\android-34'
    if (-not (Test-Path (Join-Path $plDir 'android.jar'))) {
        Say '  [1/3] Android platform 34 (about 60 MB) ...'
        $f = @(Resolve-ArchiveNames $doc 'platforms;android-34')
        $f += 'platform-34-ext7_r03.zip'
        $f += 'platform-34-ext7_r02.zip'
        $f += 'platform-34_r03.zip'
        if (-not (Fetch (Sdk-Urls $f) $tmpZip 20000000)) { return $false }
        Say '    extracting ...'
        UnzipTop $tmpZip $plDir
    } else {
        Say '  [1/3] Android platform 34 already present'
    }

    $btDir = Join-Path $sdkRoot 'build-tools\34.0.0'
    if (-not (Test-Path (Join-Path $btDir 'aapt2.exe'))) {
        Say '  [2/3] build-tools 34.0.0 (about 50 MB) ...'
        $f = @(Resolve-ArchiveNames $doc 'build-tools;34.0.0')
        $f += 'build-tools_r34-windows.zip'
        if (-not (Fetch (Sdk-Urls $f) $tmpZip 20000000)) { return $false }
        Say '    extracting ...'
        UnzipTop $tmpZip $btDir
    } else {
        Say '  [2/3] build-tools 34.0.0 already present'
    }

    $ptDir = Join-Path $sdkRoot 'platform-tools'
    if (-not (Test-Path (Join-Path $ptDir 'adb.exe'))) {
        Say '  [3/3] platform-tools (about 10 MB) ...'
        $f = @('platform-tools-latest-windows.zip')
        $f += @(Resolve-ArchiveNames $doc 'platform-tools')
        if (-not (Fetch (Sdk-Urls $f) $tmpZip 3000000)) { return $false }
        Say '    extracting ...'
        UnzipTop $tmpZip $ptDir
    } else {
        Say '  [3/3] platform-tools already present'
    }
    return $true
}

# Plan B: official cmdline-tools + sdkmanager (slower, but always correct).
function Install-SdkViaSdkManager([string]$sdkRoot, $doc) {
    $sm = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
    if (-not (Test-Path $sm)) {
        Say '  [*] downloading official cmdline-tools (about 130 MB) ...'
        $f = @(Resolve-ArchiveNames $doc 'cmdline-tools;latest')
        $f += 'commandlinetools-win-11076708_latest.zip'
        $f += 'commandlinetools-win-9477386_latest.zip'
        $zip = Join-Path $sdkRoot '_cmdline.zip'
        if (-not (Fetch (Sdk-Urls $f) $zip 20000000)) { return $false }
        Say '    extracting ...'
        UnzipTop $zip (Join-Path $sdkRoot 'cmdline-tools\latest')
    }
    if (-not (Test-Path $sm)) { return $false }

    Write-SdkLicenses $sdkRoot
    Say '  [*] running official sdkmanager (downloads from Google, several minutes) ...'
    $smArgs = '--sdk_root="' + $sdkRoot + '" "platform-tools" "platforms;android-34" "build-tools;34.0.0" 2>&1'
    cmd /c ('echo y| "' + $sm + '" ' + $smArgs) | ForEach-Object { Write-Host ('    ' + $_) }
    return (Test-Path (Join-Path $sdkRoot 'platforms\android-34\android.jar'))
}

# Minimal Android SDK: platform 34 + build-tools 34.0.0 + platform-tools
function Install-AndroidSdk([string]$sdkRoot) {
    if (-not (Test-Path $sdkRoot)) { New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null }

    Say '  reading Google SDK package index ...'
    $doc = Get-SdkRepoXml
    if ($doc) {
        Say '  [OK] index loaded, real archive names resolved'
    } else {
        Say '  [WARN] index unreachable, falling back to built-in archive names'
    }

    try { Install-SdkDirect $sdkRoot $doc | Out-Null } catch { Say ('  [WARN] direct download error: ' + $_.Exception.Message) }

    if (-not (Test-SdkComplete $sdkRoot)) {
        Say '  [INFO] direct download incomplete -> switching to official sdkmanager'
        try { Install-SdkViaSdkManager $sdkRoot $doc | Out-Null } catch { Say ('  [WARN] sdkmanager error: ' + $_.Exception.Message) }
    }

    if (Test-SdkComplete $sdkRoot) {
        Write-SdkLicenses $sdkRoot
        return $true
    }
    return $false
}

try {
    Say '============================================'
    Say '  LibreTV App - One-click APK Build'
    Say ('  Root: ' + $root)
    Say '============================================'
    Say ''

    # ---- 1. Java: need JDK 17 (18/19 acceptable). Auto-provision if missing. ----
    $jdkRoot = Join-Path $root '.jdk'

    $searchDirs = @(
        'C:\Program Files\Eclipse Adoptium',
        'C:\Program Files\Java',
        'C:\Program Files\OpenJDK',
        'C:\Program Files\Microsoft',
        'C:\Program Files\Android\Android Studio\jbr',
        ($env:LOCALAPPDATA + '\Android Studio\jbr'),
        ($env:LOCALAPPDATA + '\Programs\Android Studio\jbr')
    )

    $allJava = @()
    $lp = Find-LocalPortableJdk $jdkRoot
    if ($lp) { $allJava += $lp }
    if ($env:JAVA_HOME -and (Test-Path ($env:JAVA_HOME + '\bin\java.exe'))) { $allJava += ($env:JAVA_HOME + '\bin\java.exe') }
    $pj = Get-Command java -ErrorAction SilentlyContinue
    if ($pj) { $allJava += $pj.Source }
    foreach ($d in $searchDirs) {
        if (Test-Path $d) {
            Get-ChildItem $d -Recurse -Filter java.exe -ErrorAction SilentlyContinue | ForEach-Object { $allJava += $_.FullName }
        }
    }
    $allJava = @($allJava | Sort-Object -Unique)

    $chosen = $null
    foreach ($j in $allJava) { if ((Get-JavaMajor $j) -eq 17) { $chosen = $j; break } }
    if (-not $chosen) {
        foreach ($j in $allJava) {
            $mj = Get-JavaMajor $j
            if ($mj -ge 18 -and $mj -le 19) { $chosen = $j; break }
        }
    }

    if (-not $chosen) {
        Say '[INFO] No compatible JDK found on this machine.'
        Say '[INFO] This project needs JDK 17 (Gradle 8.2.1 can only run on JDK 17-19).'
        foreach ($j in $allJava) {
            $mj = Get-JavaMajor $j
            if ($mj -gt 0) { Say ('       found but unusable: JDK ' + $mj + '  ->  ' + $j) }
        }
        Say '[INFO] Auto-installing a PORTABLE JDK 17 into .jdk\ (about 180 MB, one time).'
        $chosen = Install-PortableJdk17 $jdkRoot
        if (-not $chosen) {
            Fail 'Auto-install of JDK 17 failed (network blocked?). Manual fallback: winget install EclipseAdoptium.Temurin.17.JDK'
        }
        Say ('[OK] Portable JDK 17 ready: ' + $chosen)
    }

    $env:JAVA_HOME = Split-Path (Split-Path $chosen)
    $env:Path = ($env:JAVA_HOME + '\bin;' + $env:Path)
    Say ('[OK] Java: ' + $chosen + '  (JDK ' + (Get-JavaMajor $chosen) + ')')
    Say ('[OK] JAVA_HOME=' + $env:JAVA_HOME)
    Say ''

    # ---- 2. Android SDK: use an existing complete SDK, else provision a local one ----
    $localSdk = Join-Path $root '.android-sdk'
    $sdkCandidates = @()
    if ($env:ANDROID_HOME) { $sdkCandidates += $env:ANDROID_HOME }
    if ($env:ANDROID_SDK_ROOT) { $sdkCandidates += $env:ANDROID_SDK_ROOT }
    $sdkCandidates += ($env:LOCALAPPDATA + '\Android\Sdk')
    $sdkCandidates += ($env:USERPROFILE + '\AppData\Local\Android\Sdk')
    $sdkCandidates += 'C:\Android\Sdk'
    $sdkCandidates += 'D:\Android\Sdk'
    $sdkCandidates += $localSdk

    $sdk = $null
    foreach ($c in $sdkCandidates) {
        if ($c -and (Test-Path (Join-Path $c 'platforms\android-34\android.jar'))) { $sdk = $c; break }
    }

    if (-not $sdk) {
        Say '[INFO] No usable Android SDK found (Android Studio may be installed, but the SDK was never downloaded).'
        Say '[INFO] Auto-installing a MINIMAL Android SDK into .android-sdk\ (about 120 MB, one time).'
        Say '[INFO] Nothing is installed into Windows; it is used by this build only.'
        if (-not (Install-AndroidSdk $localSdk)) {
            Fail 'Auto-install of Android SDK failed (network blocked?). Manual fallback: open Android Studio -> More Actions -> SDK Manager -> install "Android 14.0 (API 34)" + "Android SDK Build-Tools 34", then re-run this script.'
        }
        $sdk = $localSdk
        Say '[OK] Local Android SDK ready'
    }

    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    Say ('[OK] ANDROID_HOME=' + $env:ANDROID_HOME)

    # ---- 3. Rewrite local.properties with real SDK path ----
    Set-Content -Path 'android\local.properties' -Value ('sdk.dir=' + ($sdk -replace '\\', '/')) -Encoding Ascii
    Say '[OK] android\local.properties updated'
    Say ''

    # ---- 4. Optional: sync latest web layer ----
    $syncWeb = Read-Host 'Sync latest LibreTV web layer first? (Y/N, default N)'
    if ($syncWeb -eq 'Y' -or $syncWeb -eq 'y') {
        # npm prints warnings to stderr -> would abort the script under 'Stop'
        $prevEA = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        cmd /c 'npm run sync:web 2>&1' | ForEach-Object { Write-Host $_ }
        $rc = $LASTEXITCODE
        $ErrorActionPreference = $prevEA
        # Sync writes into www\ in place. If it failed halfway, www is half-updated
        # and packaging it would produce a broken APK -> stop instead of continuing.
        if ($rc -ne 0) { Fail 'sync:web failed (see messages above). www\ may be half-updated; fix the sync script before building.' }
        Say '[OK] web layer synced'
    }

    # ---- 5. cap sync ----
    # Pre-answer the Capacitor telemetry question, otherwise the build hangs on a Y/n prompt.
    # Capacitor CLI reads env-paths('capacitor').config -> %APPDATA%\capacitor\Config\sysconfig.json
    try {
        $capCfgDir = Join-Path $env:APPDATA 'capacitor\Config'
        if (-not (Test-Path $capCfgDir)) { New-Item -ItemType Directory -Path $capCfgDir -Force | Out-Null }
        $capCfgFile = Join-Path $capCfgDir 'sysconfig.json'
        $needWrite = $true
        if (Test-Path $capCfgFile) {
            $raw = Get-Content $capCfgFile -Raw -ErrorAction SilentlyContinue
            if ($raw -and $raw -match 'telemetry') { $needWrite = $false }
        }
        if ($needWrite) {
            $mid = [guid]::NewGuid().ToString()
            $json = '{' + [char]34 + 'machine' + [char]34 + ':' + [char]34 + $mid + [char]34 + ',' + [char]34 + 'telemetry' + [char]34 + ':false}'
            Set-Content -Path $capCfgFile -Value $json -Encoding Ascii
            Say '[OK] Capacitor telemetry prompt disabled'
        }
    } catch {
        Say '[WARN] could not pre-set Capacitor telemetry config; you may be asked Y/n once'
    }

    Say 'Running npx cap sync ...'
    # Same stderr trap as gradle: run through cmd.exe with 2>&1 merged.
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    cmd /c 'npx cap sync 2>&1' | ForEach-Object { Write-Host $_ }
    $rc = $LASTEXITCODE
    $ErrorActionPreference = $prevEA
    if ($rc -ne 0) { Fail 'cap sync failed (is node_modules installed? run: npm install)' }

    # ---- 6. Pick build type by keystore ----
    $buildType = 'assembleDebug'
    if (Test-Path 'android\app\libretv-release.keystore') {
        $buildType = 'assembleRelease'
        Say '[INFO] release keystore found, building Release'
    } else {
        Say '[INFO] no release keystore, building Debug (installable for testing)'
    }

    # ---- 7. Gradle build (live output + log file) ----
    # IMPORTANT: gradlew writes javac notes/warnings to stderr, e.g.
    #   'Note: Some input files use unchecked or unsafe operations.'
    # Under $ErrorActionPreference = 'Stop' PowerShell converts native stderr
    # into a terminating NativeCommandError and KILLS the build mid-way.
    # Fix: let cmd.exe merge stderr into stdout (2>&1) so PowerShell only ever
    # receives plain stdout text, and relax the error preference around it.
    Say ('Building ' + $buildType + ' ... (first run downloads Gradle + deps, can take several minutes)')
    Say 'Live output below; a full copy is saved to build_log.txt'
    Say ''

    $logPath = Join-Path $root 'build_log.txt'
    if (Test-Path $logPath) { Remove-Item $logPath -Force -ErrorAction SilentlyContinue }

    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location 'android'
    $cmdLine = '.\gradlew.bat ' + $buildType + ' --no-daemon --console=plain 2>&1'
    cmd /c $cmdLine | Tee-Object -FilePath $logPath
    $code = $LASTEXITCODE
    Pop-Location
    $ErrorActionPreference = $prevEA

    if ($buildType -eq 'assembleRelease') {
        $apkDir = 'android\app\build\outputs\apk\release'
        $apkPattern = 'LibreTV-v*-release.apk'
    } else {
        $apkDir = 'android\app\build\outputs\apk\debug'
        $apkPattern = 'LibreTV-v*-debug.apk'
    }
    # 自定义输出名（build.gradle applicationVariants）：LibreTV-v{versionName}-{buildType}.apk
    $apkFull = Get-ChildItem (Join-Path $root $apkDir) -Filter $apkPattern -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($apkFull) { $apkFull = $apkFull.FullName }

    # Authoritative success signal: the APK really exists on disk.
    if (-not $apkFull -or -not (Test-Path $apkFull)) {
        Write-Host ''
        Write-Host ('[ERROR] Build failed (gradle exit code ' + $code + ', no APK produced).') -ForegroundColor Red
        Write-Host ('Full log: ' + $logPath)
        Fail 'Build failed, see the output above'
    }

    $sizeMb = [math]::Round((Get-Item $apkFull).Length / 1MB, 1)
    Say '============================================'
    Say ('Build OK: ' + $apkFull)
    Say ('Full path: ' + $apkFull)
    Say ('Size: ' + $sizeMb + ' MB')
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
