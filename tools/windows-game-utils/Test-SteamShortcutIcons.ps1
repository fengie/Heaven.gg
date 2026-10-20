# Regression tests for bounded Steam .url icon repair.
# Windows PowerShell 5.1; disposable fixtures; no Steam installation, network, or user files.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'Repair-SteamShortcutIcons.ps1'
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$errors)
if (@($errors | Where-Object { $null -ne $_ }).Count -gt 0) {
    throw ('STEAM_REPAIR_PARSE_FAILED: ' + (@($errors) -join '; '))
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('heaven-steam-shortcut-test-' + [guid]::NewGuid().ToString('N'))
$desktop = Join-Path $root 'Desktop'
$icons = Join-Path $root 'SteamIcons'
$cache = Join-Path $root 'Cache'
$backups = Join-Path $root 'Backups'
New-Item -ItemType Directory -Path $desktop, $icons -Force | Out-Null

$hash = 'a' * 40
$icon = Join-Path $icons ($hash + '.ico')
# Use an actual, Windows-decodable ICO, not a fabricated header-only test fixture.
Add-Type -AssemblyName System.Drawing
$iconStream = [IO.File]::Create($icon)
try { [System.Drawing.SystemIcons]::Application.Save($iconStream) }
finally { $iconStream.Dispose() }
$brokenIcon = 'Z:\MovedSteam\steam\games\' + $hash + '.ico'
$link = Join-Path $desktop 'Test Game.url'
$original = "[InternetShortcut]" + [Environment]::NewLine +
            "URL=steam://rungameid/730" + [Environment]::NewLine +
            "IconFile=$brokenIcon" + [Environment]::NewLine +
            "IconIndex=0" + [Environment]::NewLine +
            "CustomFlag=keep-me" + [Environment]::NewLine
[IO.File]::WriteAllText($link, $original, [Text.Encoding]::Unicode)
$unrelated = Join-Path $desktop 'Website.url'
[IO.File]::WriteAllText($unrelated, ("[InternetShortcut]" + [Environment]::NewLine + "URL=https://example.com/" + [Environment]::NewLine), [Text.Encoding]::ASCII)
$malformed = Join-Path $desktop 'NotSteam.url'
[IO.File]::WriteAllText($malformed, ("[InternetShortcut]" + [Environment]::NewLine + "URL=steam://run/730/extra" + [Environment]::NewLine + "IconFile=$brokenIcon" + [Environment]::NewLine), [Text.Encoding]::ASCII)

function Invoke-Fixture {
    param([string]$Mode = 'Inspect', [switch]$WhatIf)
    $opts = @{
        Mode = $Mode
        ShortcutRoots = @($desktop)
        SteamIconRoots = @($icons)
        CacheDirectory = $cache
        BackupDirectory = $backups
        WhatIf = [bool]$WhatIf
        Confirm = $false
    }
    @( & $target @opts )
}

try {
    $before = [Convert]::ToBase64String([IO.File]::ReadAllBytes($link))
    $plan = @(Invoke-Fixture)
    $candidate = @($plan | Where-Object { $_.app_id -eq '730' })
    if ($candidate.Count -ne 1 -or $candidate[0].status -ne 'LOCAL_ICON_AVAILABLE') {
        throw "INSPECT_REPAIR_PLAN_FAILED: $($plan | ConvertTo-Json -Compress)"
    }
    if ($before -cne [Convert]::ToBase64String([IO.File]::ReadAllBytes($link))) {
        throw 'INSPECT_MODIFIED_SHORTCUT'
    }
    if (Test-Path -LiteralPath $backups) { throw 'INSPECT_CREATED_BACKUPS' }

    $dry = @(Invoke-Fixture -Mode Repair -WhatIf)
    if (@($dry | Where-Object { $_.status -eq 'WHATIF' }).Count -ne 1) {
        throw 'WHATIF_DID_NOT_SKIP_WRITE'
    }
    if (Test-Path -LiteralPath $cache) { throw 'WHATIF_CREATED_CACHE' }

    $repaired = @(Invoke-Fixture -Mode Repair)
    $fixed = @($repaired | Where-Object { $_.status -eq 'REPAIRED' })
    if ($fixed.Count -ne 1 -or -not (Test-Path -LiteralPath $fixed[0].backup)) {
        throw "REPAIR_OR_BACKUP_FAILED: $($repaired | ConvertTo-Json -Compress)"
    }
    $bytes = [IO.File]::ReadAllBytes($link)
    if ($bytes[0] -ne 255 -or $bytes[1] -ne 254) { throw 'UTF16_BOM_NOT_PRESERVED' }
    $actual = [IO.File]::ReadAllText($link, [Text.Encoding]::Unicode)
    if (-not $actual.Contains('URL=steam://rungameid/730') -or
        -not $actual.Contains('CustomFlag=keep-me') -or
        -not $actual.Contains("IconFile=$icon")) {
        throw 'STEAM_SHORTCUT_CONTENT_CORRUPTED'
    }
    if ([IO.File]::ReadAllText($fixed[0].backup, [Text.Encoding]::Unicode) -cne $original) {
        throw 'BACKUP_NOT_ORIGINAL'
    }
    if (@(Invoke-Fixture -Mode Repair | Where-Object { $_.status -eq 'REPAIRED' }).Count -ne 0) {
        throw 'REPAIR_NOT_IDEMPOTENT'
    }
    if (-not (Test-Path -LiteralPath $unrelated) -or
        -not ([IO.File]::ReadAllText($unrelated).Contains('https://example.com/'))) {
        throw 'UNRELATED_SHORTCUT_CHANGED'
    }
    if (-not ([IO.File]::ReadAllText($malformed).Contains('steam://run/730/extra'))) {
        throw 'MALFORMED_SHORTCUT_CHANGED'
    }

    $unavailable = Join-Path $desktop 'Unavailable.url'
    $otherHash = 'b' * 40
    [IO.File]::WriteAllText($unavailable, ("[InternetShortcut]" + [Environment]::NewLine + "URL=steam://run/570" + [Environment]::NewLine + "IconFile=Z:\missing\$otherHash.ico" + [Environment]::NewLine), [Text.Encoding]::ASCII)
    $unavailableBefore = [IO.File]::ReadAllText($unavailable)
    $missing = @(Invoke-Fixture -Mode Repair)
    if (@($missing | Where-Object { $_.status -eq 'SOURCE_UNAVAILABLE' }).Count -ne 1) {
        throw ('UNAVAILABLE_SOURCE_NOT_REPORTED: ' + ($missing | ConvertTo-Json -Compress))
    }
    if ([IO.File]::ReadAllText($unavailable) -cne $unavailableBefore) {
        throw 'UNAVAILABLE_SOURCE_MODIFIED'
    }
    if (Test-Path -LiteralPath $cache) { throw 'UNAUTHORIZED_NETWORK_OR_CACHE_ACCESS' }

    # Bad ICO with a valid directory header but unusable image payload must be rejected.
    $fake = Join-Path $icons ($otherHash + '.ico')
    [IO.File]::WriteAllBytes($fake, [byte[]]@(0,0,1,0,1,0,16,16,0,0,1,0,32,0,4,0,0,0,22,0,0,0,0,0,0,0))
    $fakeResult = @(Invoke-Fixture | Where-Object { $_.app_id -eq '570' })
    if ($fakeResult.Count -ne 1 -or $fakeResult[0].status -ne 'SOURCE_UNAVAILABLE') {
        throw ('MALFORMED_ICO_ACCEPTED: ' + ($fakeResult | ConvertTo-Json -Compress))
    }
    Remove-Item -LiteralPath $fake -Force

    # Real missing IconFile/hash use case: rehydrate from Steam client library art.
    $libraryArt = Join-Path $root 'LibraryCache'
    New-Item -ItemType Directory -Path $libraryArt -Force | Out-Null
    $artwork = Join-Path $libraryArt '570_icon.png'
    $image = New-Object System.Drawing.Bitmap(48, 48)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($image)
        try { $graphics.Clear([System.Drawing.Color]::Blue) }
        finally { $graphics.Dispose() }
        $image.Save($artwork, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $image.Dispose() }
    $bareRoot = Join-Path $root 'NoHashDesktop'
    New-Item -ItemType Directory -Path $bareRoot -Force | Out-Null
    $bare = Join-Path $bareRoot 'Steam lost hash.url'
    $bareOriginal = "[InternetShortcut]" + [Environment]::NewLine +
        "URL=steam://rungameid/570" + [Environment]::NewLine +
        "IconFile=" + [Environment]::NewLine +
        "Preserve=keep-me" + [Environment]::NewLine
    [IO.File]::WriteAllText($bare, $bareOriginal, [Text.Encoding]::Unicode)
    $artOpts = @{
        ShortcutRoots=@($bareRoot)
        SteamIconRoots=@($icons)
        SteamLibraryCacheRoots=@($libraryArt)
        CacheDirectory=$cache
        BackupDirectory=$backups
        Confirm=$false
    }
    $artInspection = @( & $target @artOpts -Mode Inspect )
    if (@($artInspection | Where-Object { $_.status -eq 'LOCAL_ARTWORK_AVAILABLE' }).Count -ne 1) {
        throw ('LOCAL_ARTWORK_NOT_DISCOVERED: ' + ($artInspection | ConvertTo-Json -Compress))
    }
    $artFix = @( & $target @artOpts -Mode Repair )
    if (@($artFix | Where-Object { $_.status -eq 'REPAIRED' }).Count -ne 1) {
        throw ('MISSING_HASH_ARTWORK_NOT_REPAIRED: ' + ($artFix | ConvertTo-Json -Compress))
    }
    $newIconPath = @($artFix | Where-Object { $_.status -eq 'REPAIRED' })[0].icon
    if (-not (Test-Path -LiteralPath $newIconPath) -or
        -not ([IO.File]::ReadAllText($bare, [Text.Encoding]::Unicode).Contains("IconFile=$newIconPath")) -or
        -not ([IO.File]::ReadAllText($bare, [Text.Encoding]::Unicode).Contains('Preserve=keep-me'))) {
        throw 'MISSING_HASH_ARTWORK_SHORTCUT_CORRUPTED'
    }
    if (@(& $target @artOpts -Mode Repair | Where-Object { $_.status -eq 'REPAIRED' }).Count -ne 0) {
        throw 'MISSING_HASH_ARTWORK_NOT_IDEMPOTENT'
    }
    Write-Output 'PASS: Steam missing hash rehydrated from local library PNG artwork with preserved URL fields'

    # Mock Invoke-WebRequest so the success, failure, and edit-race paths never use the network.
    $downloadRoot = Join-Path $root 'DownloadDesktop'
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    $downloadHash = 'c' * 40
    $downloadLink = Join-Path $downloadRoot 'Downloaded.url'
    $downloadOriginal = "[InternetShortcut]" + [Environment]::NewLine +
        "URL=steam://run/505" + [Environment]::NewLine +
        "IconFile=Z:\missing\$downloadHash.ico" + [Environment]::NewLine +
        "Comment=keep-non-icon-content" + [Environment]::NewLine
    [IO.File]::WriteAllText($downloadLink, $downloadOriginal, (New-Object Text.UTF8Encoding($false)))
    $global:HeavenSteamFixtureIcon = $icon
    $global:HeavenSteamFixtureArt = $artwork
    $global:HeavenSteamDownloadCalls = 0
    $global:HeavenSteamDownloadMode = 'fallback'
    $global:HeavenSteamRaceShortcut = ''
    function Invoke-WebRequest {
        [CmdletBinding()]
        param([string]$Uri, [string]$OutFile, [int]$TimeoutSec, [int]$MaximumRedirection, [switch]$UseBasicParsing)
        if ($Uri -notmatch '^https://(?:shared\.fastly|cdn\.cloudflare)\.steamstatic\.com/') {
            throw 'TEST_DOWNLOAD_UNAPPROVED_HOST'
        }
        $global:HeavenSteamDownloadCalls += 1
        if ($global:HeavenSteamDownloadMode -eq 'fallback' -and $global:HeavenSteamDownloadCalls -eq 1) {
            throw 'Simulated Steam primary CDN failure'
        }
        if ($global:HeavenSteamDownloadMode -eq 'artwork') {
            if ($Uri -notmatch '/capsule_184x69\.jpg$') { throw 'TEST_NOT_A_STORE_ASSET' }
            [IO.File]::Copy($global:HeavenSteamFixtureArt, $OutFile, $false)
            return
        }
        [IO.File]::Copy($global:HeavenSteamFixtureIcon, $OutFile, $false)
        if ($global:HeavenSteamDownloadMode -eq 'race') {
            # Simulate a real UTF-16-aware editor; do not corrupt the test fixture.
            $externalText = [IO.File]::ReadAllText($global:HeavenSteamRaceShortcut, [Text.Encoding]::Unicode)
            [IO.File]::WriteAllText($global:HeavenSteamRaceShortcut,
                $externalText + "ExternalEdit=preserve-me" + [Environment]::NewLine,
                [Text.Encoding]::Unicode)
        }
    }

    try {
        $params = @{
            ShortcutRoots = @($downloadRoot)
            SteamIconRoots = @($icons)
            CacheDirectory = $cache
            BackupDirectory = $backups
            Mode = 'Repair'
            AllowDownload = $true
            Confirm = $false
        }
        $preview = @( & $target @params -WhatIf )
        if (@($preview | Where-Object { $_.status -eq 'WHATIF' }).Count -ne 1 -or
            $global:HeavenSteamDownloadCalls -ne 0) {
            throw 'DOWNLOAD_WHATIF_PERFORMED_SIDE_EFFECT'
        }
        $success = @( & $target @params )
        $downloaded = @($success | Where-Object { $_.status -eq 'REPAIRED' })
        if ($downloaded.Count -ne 1 -or $global:HeavenSteamDownloadCalls -ne 2 -or
            -not (Test-Path -LiteralPath $downloaded[0].icon)) {
            throw ('MOCK_CDN_FALLBACK_FAILED: calls=' + $global:HeavenSteamDownloadCalls + '; ' + ($success | ConvertTo-Json -Compress))
        }
        if (-not ([IO.File]::ReadAllText($downloadLink).Contains('Comment=keep-non-icon-content'))) {
            throw 'DOWNLOAD_MODIFIED_NON_ICON_FIELD'
        }
        if (-not (Test-Path -LiteralPath $downloaded[0].backup)) {
            throw 'DOWNLOAD_MISSING_BACKUP'
        }

        # A URL with no IconFile at all must also recover from opt-in Valve artwork.
        $remoteRoot = Join-Path $root 'RemoteArtDesktop'
        New-Item -ItemType Directory -Path $remoteRoot -Force | Out-Null
        $remoteShortcut = Join-Path $remoteRoot 'Remote artwork.url'
        $remoteOriginal = "[InternetShortcut]" + [Environment]::NewLine +
            "URL=steam://run/775" + [Environment]::NewLine +
            "Custom=keep-art-fields" + [Environment]::NewLine
        [IO.File]::WriteAllText($remoteShortcut, $remoteOriginal, [Text.Encoding]::Unicode)
        $global:HeavenSteamDownloadMode = 'artwork'
        $params.ShortcutRoots = @($remoteRoot)
        $remote = @( & $target @params )
        if (@($remote | Where-Object { $_.status -eq 'REPAIRED' }).Count -ne 1) {
            throw ('REMOTE_ARTWORK_DOWNLOAD_FAILED: ' + ($remote | ConvertTo-Json -Compress))
        }
        $remoteIcon = @($remote | Where-Object { $_.status -eq 'REPAIRED' })[0].icon
        if (-not (Test-Path -LiteralPath $remoteIcon) -or
            -not ([IO.File]::ReadAllText($remoteShortcut, [Text.Encoding]::Unicode).Contains("IconFile=$remoteIcon")) -or
            -not ([IO.File]::ReadAllText($remoteShortcut, [Text.Encoding]::Unicode).Contains('Custom=keep-art-fields'))) {
            throw 'REMOTE_ARTWORK_DAMAGED_SHORTCUT'
        }

        # Simulate an external edit while Steam icon download is in progress.
        $raceRoot = Join-Path $root 'RaceDesktop'
        New-Item -ItemType Directory -Path $raceRoot -Force | Out-Null
        $raceHash = 'd' * 40
        $raceLink = Join-Path $raceRoot 'Racing.url'
        [IO.File]::WriteAllText($raceLink,
            "[InternetShortcut]" + [Environment]::NewLine +
            "URL=steam://run/506" + [Environment]::NewLine +
            "IconFile=Z:\missing\$raceHash.ico" + [Environment]::NewLine,
            [Text.Encoding]::Unicode)
        $global:HeavenSteamRaceShortcut = $raceLink
        $global:HeavenSteamDownloadMode = 'race'
        $params.ShortcutRoots = @($raceRoot)
        $raced = @( & $target @params )
        $raceFailure = @($raced | Where-Object {
            $_.status -eq 'ERROR' -and $_.detail -match 'SHORTCUT_CHANGED'
        })
        if ($raceFailure.Count -ne 1 -or
            -not ([IO.File]::ReadAllText($raceLink).Contains('ExternalEdit=preserve-me'))) {
            throw ('CONCURRENT_SHORTCUT_EDIT_WAS_NOT_PROTECTED: ' + ($raced | ConvertTo-Json -Compress))
        }
    } finally {
        Remove-Item -Path 'Function:\Invoke-WebRequest' -ErrorAction SilentlyContinue
        foreach ($var in @('HeavenSteamFixtureIcon','HeavenSteamFixtureArt','HeavenSteamDownloadCalls','HeavenSteamDownloadMode','HeavenSteamRaceShortcut')) {
            Remove-Variable -Scope Global -Name $var -ErrorAction SilentlyContinue
        }
    }
    Write-Output 'PASS: Steam local and mocked CDN fallback, malformed ICO rejection, no-network WhatIf, race protection'

    Write-Output 'PASS: Steam .url preview, WhatIf, local-first repair, UTF16 preservation, backups, idempotence, unrelated isolation, offline failure'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop
}