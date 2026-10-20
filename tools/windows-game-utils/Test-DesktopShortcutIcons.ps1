# Native Windows PowerShell 5.1 fixtures for the Desktop-wide missing-icon scanner.
# Isolated files only. No real Desktop, Start Menu, Steam, network or cache mutations.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'Repair-DesktopShortcutIcons.ps1'
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($tool, [ref]$tokens, [ref]$errors)
if (@($errors | Where-Object { $_ }).Count -gt 0) {
    throw ('SHORTCUT_REPAIR_PARSE_FAILED: ' + (@($errors) -join '; '))
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('heaven-icon-fixture-' + [guid]::NewGuid().ToString('N'))
$desktop = Join-Path $root 'Desktop'
$subfolder = Join-Path $desktop 'Heaven Tools'
$backups = Join-Path $root 'Backups'
$cache = Join-Path $root 'Cache'
New-Item -ItemType Directory -Path $subfolder -Force | Out-Null
$wsh = New-Object -ComObject WScript.Shell
$exe = Join-Path $env:WINDIR 'System32\notepad.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'TEST_EXECUTABLE_NOT_FOUND' }

$broken = Join-Path $subfolder 'Broken target icon.lnk'
$shortcut = $wsh.CreateShortcut($broken)
$shortcut.TargetPath = $exe
$shortcut.Arguments = '/placeholder'
$shortcut.IconLocation = 'Z:\OldApps\missing.ico,0'
$shortcut.Description = 'Preserve all metadata'
$shortcut.Save()

$missing = Join-Path $desktop 'Missing app.lnk'
$shortcut = $wsh.CreateShortcut($missing)
$shortcut.TargetPath = 'Z:\NotAvailable\missing-app.exe'
$shortcut.IconLocation = 'Z:\NotAvailable\missing-app.ico,0'
$shortcut.Save()

$web = Join-Path $desktop 'Web with lost favicon.url'
[IO.File]::WriteAllText($web,
    "[InternetShortcut]" + [Environment]::NewLine +
    "URL=https://example.com/" + [Environment]::NewLine +
    "IconFile=Z:\OldFolder\missing.ico" + [Environment]::NewLine,
    [Text.Encoding]::Unicode)
$steam = Join-Path $desktop 'Steam with no icon hash.url'
[IO.File]::WriteAllText($steam,
    "[InternetShortcut]" + [Environment]::NewLine +
    "URL=steam://rungameid/570" + [Environment]::NewLine +
    "IconFile=" + [Environment]::NewLine,
    [Text.Encoding]::Unicode)
$plain = Join-Path $desktop 'Plain website.url'
[IO.File]::WriteAllText($plain,
    "[InternetShortcut]" + [Environment]::NewLine +
    "URL=https://example.org/" + [Environment]::NewLine,
    [Text.Encoding]::Unicode)

function Run-Test {
    param([string]$Mode='Inspect', [switch]$WhatIf)
    $opts = @{
        Mode = $Mode
        ShortcutRoots = @($desktop)
        BackupDirectory = $backups
        CacheDirectory = $cache
        Confirm = $false
        WhatIf = [bool]$WhatIf
    }
    @( & $tool @opts )
}
function Assert-Status {
    param($Rows, [string]$Path, [string]$Expected)
    $got = @($Rows | Where-Object { $_.path -eq $Path -and $_.status -eq $Expected })
    if ($got.Count -ne 1) {
        throw ('STATUS_FAILED: ' + $Path + ' expected=' + $Expected + '; actual=' +
            ($Rows | ConvertTo-Json -Depth 4 -Compress))
    }
}
try {
    $before = (Get-FileHash -LiteralPath $broken -Algorithm SHA256).Hash
    $scan = @(Run-Test)
    Assert-Status $scan $broken 'REPAIRABLE_TARGET_ICON'
    Assert-Status $scan $missing 'TARGET_MISSING'
    Assert-Status $scan $web 'BROKEN_ICON_NO_SAFE_SOURCE'
    Assert-Status $scan $plain 'NO_CUSTOM_ICON'
    Assert-Status $scan $steam 'MISSING_ICON_REFERENCE'
    if (@($scan | Where-Object { $_.type -eq 'SUMMARY' -and $_.total -ge 5 }).Count -ne 1) {
        throw 'SUMMARY_MISSING'
    }
    if ((Get-FileHash -LiteralPath $broken -Algorithm SHA256).Hash -cne $before -or
        (Test-Path -LiteralPath $backups)) { throw 'INSPECT_WROTE' }

    $whatif = @(Run-Test -Mode Repair -WhatIf)
    Assert-Status $whatif $broken 'WHATIF'
    if ((Get-FileHash -LiteralPath $broken -Algorithm SHA256).Hash -cne $before -or
        (Test-Path -LiteralPath $backups)) { throw 'WHATIF_WROTE' }

    $changed = @(Run-Test -Mode Repair)
    Assert-Status $changed $broken 'REPAIRED'
    Assert-Status $changed $missing 'TARGET_MISSING'
    Assert-Status $changed $web 'BROKEN_ICON_NO_SAFE_SOURCE'
    $row = @($changed | Where-Object { $_.path -eq $broken })[0]
    if (-not (Test-Path -LiteralPath $row.backup)) { throw 'BACKUP_MISSING' }
    if ((Get-FileHash -LiteralPath $row.backup -Algorithm SHA256).Hash -cne $before) {
        throw 'BACKUP_DIFFERENT'
    }
    $after = $wsh.CreateShortcut($broken)
    if ($after.TargetPath -ine $exe -or $after.Arguments -cne '/placeholder' -or
        $after.Description -cne 'Preserve all metadata' -or
        $after.IconLocation -notlike "$exe*") { throw 'LINK_METADATA_MODIFIED' }
    $again = @(Run-Test -Mode Repair)
    if (@($again | Where-Object { $_.status -eq 'REPAIRED' }).Count -ne 0) {
        throw 'NOT_IDEMPOTENT'
    }
    Write-Output 'PASS: Desktop .lnk and .url inventory, bounded .lnk icon repair, WhatIf, byte backup, missing-target isolation, nested Heaven Tools, idempotence'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop
}
