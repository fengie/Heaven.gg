# Desktop-wide broken shortcut icon inventory and conservative repair.
# Windows PowerShell 5.1; default inspect only, no admin, no game moves.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [ValidateSet('Inspect', 'Repair')][string]$Mode = 'Inspect',
    [string[]]$ShortcutRoots = @(),
    [string]$CacheDirectory = '',
    [string]$BackupDirectory = '',
    [switch]$IncludeStartMenu,
    [switch]$AllowDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing -ErrorAction Stop
$steamTool = Join-Path $PSScriptRoot 'Repair-SteamShortcutIcons.ps1'
if (-not (Test-Path -LiteralPath $steamTool -PathType Leaf)) {
    throw 'STEAM_REPAIR_COMPONENT_MISSING'
}
if (-not $CacheDirectory) {
    $CacheDirectory = Join-Path $env:LOCALAPPDATA 'HeavenToolbox\steam-shortcut-icons\cache'
}
if (-not $BackupDirectory) {
    $BackupDirectory = Join-Path $env:LOCALAPPDATA 'HeavenToolbox\steam-shortcut-icons\backups'
}
if (@($ShortcutRoots).Count -eq 0) {
    $ShortcutRoots = @(
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory')
    )
}
if ($IncludeStartMenu) {
    $ShortcutRoots += @(
        [Environment]::GetFolderPath('StartMenu'),
        [Environment]::GetFolderPath('CommonStartMenu')
    )
}

function Resolve-IconPath {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
    # Windows WSH emits "C:\a,b\file.exe,-3"; split on the LAST comma only.
    $match = [regex]::Match($Value.Trim(), '^(.*),-?\d+$')
    if ($match.Success) { $Value = $match.Groups[1].Value }
    return [Environment]::ExpandEnvironmentVariables($Value.Trim().Trim('"'))
}

function Test-IconSource {
    param([string]$Path)
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $ext = [IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($ext -notin @('.exe','.dll','.ico','.icl')) { return $false }
    $icon = $null
    $bitmap = $null
    try {
        if ($ext -eq '.ico') { $icon = [System.Drawing.Icon]::new($Path) }
        else { $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Path) }
        if ($null -eq $icon) { return $false }
        $bitmap = $icon.ToBitmap()
        return ($bitmap.Width -gt 0 -and $bitmap.Height -gt 0)
    } catch { return $false }
    finally {
        if ($null -ne $bitmap) { $bitmap.Dispose() }
        if ($null -ne $icon) { $icon.Dispose() }
    }
}

function Read-UrlShortcut {
    param([string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -gt 65536) { throw 'SHORTCUT_TOO_LARGE' }
    $encoding = [Text.Encoding]::GetEncoding(28591)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) {
        $encoding = [Text.Encoding]::Unicode
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 254 -and $bytes[1] -eq 255) {
        $encoding = [Text.Encoding]::BigEndianUnicode
    } elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
        $encoding = New-Object Text.UTF8Encoding($true)
    }
    $text = $encoding.GetString($bytes)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xfeff) { $text = $text.Substring(1) }
    return $text
}

$files = New-Object 'System.Collections.Generic.List[object]'
$results = New-Object 'System.Collections.Generic.List[object]'
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$directories = New-Object 'System.Collections.Generic.Queue[string]'
$foldersExamined = 0

foreach ($root in @($ShortcutRoots | Where-Object { $_ } | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $root -PathType Container) { $directories.Enqueue($root) }
    else {
        $results.Add([pscustomobject]@{
            type='ROOT'; path=$root; status='ROOT_UNAVAILABLE'; icon=''; backup=''; detail='Root not found or inaccessible'
        })
    }
}
# Iterative, bounded traversal; do not descend into symlink/junction directories.
while ($directories.Count -gt 0) {
    $folder = $directories.Dequeue()
    if (-not $seen.Add([IO.Path]::GetFullPath($folder))) { continue }
    $foldersExamined += 1
    if ($foldersExamined -gt 1500) { throw 'SCAN_FOLDER_LIMIT_EXCEEDED' }
    try {
        $children = @(Get-ChildItem -LiteralPath $folder -Force -ErrorAction Stop)
        foreach ($child in $children) {
            if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
            if ($child.PSIsContainer) {
                $directories.Enqueue($child.FullName)
            } elseif ($child.Extension -in @('.lnk','.url')) {
                $files.Add($child)
                if ($files.Count -gt 5000) { throw 'SCAN_FILE_LIMIT_EXCEEDED' }
            }
        }
    } catch {
        if ($_.Exception.Message -match 'SCAN_(?:FILE|FOLDER)_LIMIT_EXCEEDED') { throw }
        $results.Add([pscustomobject]@{
            type='ROOT'; path=$folder; status='SCAN_ERROR'; icon=''; backup=''; detail=$_.Exception.Message
        })
    }
}

# Reuse the independently tested Steam-only engine, rather than adding a second
# Steam parser, downloader, asset cache, or shortcut mutation implementation.
$urlFiles = @($files | Where-Object { $_.Extension -ieq '.url' } | Select-Object -ExpandProperty FullName)
$steamRows = @(& $steamTool -Mode $Mode -ShortcutFiles $urlFiles -CacheDirectory $CacheDirectory -BackupDirectory $BackupDirectory -AllowDownload:$AllowDownload -WhatIf:$WhatIfPreference -Confirm:$false)
$steamMap = @{}
foreach ($row in $steamRows) {
    if ($row.shortcut -and [IO.Path]::GetExtension($row.shortcut) -ieq '.url') {
        $steamMap[[string]$row.shortcut] = $true
        $results.Add([pscustomobject]@{
            type='STEAM_URL'; path=[string]$row.shortcut; status=[string]$row.status;
            icon=[string]$row.icon; backup=[string]$row.backup;
            detail=if ($row.PSObject.Properties['detail']) { [string]$row.detail } else { '' }
        })
    }
}

$wsh = $null
foreach ($file in @($files | Sort-Object FullName -Unique)) {
    $path = $file.FullName
    if ($steamMap.ContainsKey($path)) { continue }
    $kind = if ($file.Extension -ieq '.lnk') { 'LNK' } else { 'URL' }
    $status = 'UNKNOWN'
    $iconPath = ''
    $backup = ''
    $detail = ''
    try {
        if ($kind -eq 'LNK') {
            if ($null -eq $wsh) { $wsh = New-Object -ComObject WScript.Shell }
            $link = $wsh.CreateShortcut($path)
            $target = Resolve-IconPath -Value ([string]$link.TargetPath)
            $custom = Resolve-IconPath -Value ([string]$link.IconLocation)
            $iconPath = $custom
            if (-not $target -or -not (Test-Path -LiteralPath $target -PathType Leaf)) {
                $status = 'TARGET_MISSING'
                $detail = 'Launcher target is unavailable; an icon repair cannot fix a missing application'
            } elseif (-not $custom) {
                $status = 'DEFAULT_TARGET_ICON'
                $iconPath = $target
            } elseif (Test-IconSource -Path $custom) {
                $status = 'ICON_OK'
            } elseif (-not (Test-IconSource -Path $target)) {
                $status = 'BROKEN_ICON_NO_SAFE_SOURCE'
                $detail = 'Target has no independently decodable icon'
            } else {
                $iconPath = $target
                $status = 'REPAIRABLE_TARGET_ICON'
                if ($Mode -eq 'Repair') {
                    if (-not $PSCmdlet.ShouldProcess($path, 'Back up and replace broken LNK icon with its own target icon')) {
                        $status = 'WHATIF'
                    } else {
                        $original = [IO.File]::ReadAllBytes($path)
                        New-Item -ItemType Directory -Path $BackupDirectory -Force -ErrorAction Stop | Out-Null
                        $backup = Join-Path $BackupDirectory ([guid]::NewGuid().ToString('N') + '-' + $file.Name + '.bak')
                        [IO.File]::WriteAllBytes($backup, $original)
                        if (-not [System.Collections.StructuralComparisons]::StructuralEqualityComparer.Equals(
                            $original, [IO.File]::ReadAllBytes($path))) {
                            throw 'SHORTCUT_CHANGED_DURING_REPAIR'
                        }
                        $initialTarget = [string]$link.TargetPath
                        $initialArguments = [string]$link.Arguments
                        $initialDescription = [string]$link.Description
                        $link.IconLocation = $target + ',0'
                        $link.Save()
                        $verify = $wsh.CreateShortcut($path)
                        if ([string]$verify.TargetPath -cne $initialTarget -or
                            [string]$verify.Arguments -cne $initialArguments -or
                            [string]$verify.Description -cne $initialDescription -or
                            (Resolve-IconPath -Value ([string]$verify.IconLocation)) -ine $target) {
                            throw 'LINK_VERIFICATION_FAILED'
                        }
                        $status = 'REPAIRED'
                    }
                }
            }
        } else {
            $text = Read-UrlShortcut -Path $path
            $fields = [regex]::Matches($text, '(?im)^IconFile[ \t]*=[ \t]*([^\r\n]*)')
            if ($text -notmatch '(?im)^\[InternetShortcut\][ \t]*\r?$') {
                $status = 'INVALID_URL_SHORTCUT'
            } elseif ($fields.Count -eq 0) {
                $status = 'NO_CUSTOM_ICON'
                $detail = 'Windows may display the browser default; no missing icon file is established'
            } elseif ($fields.Count -ne 1) {
                $status = 'AMBIGUOUS_ICON_REFERENCE'
            } else {
                $custom = Resolve-IconPath -Value $fields[0].Groups[1].Value
                $iconPath = $custom
                if (-not $custom) { $status = 'NO_CUSTOM_ICON' }
                elseif (Test-IconSource -Path $custom) { $status = 'ICON_OK' }
                else {
                    $status = 'BROKEN_ICON_NO_SAFE_SOURCE'
                    $detail = 'Cannot infer the original website or custom launcher icon safely'
                }
            }
        }
    } catch {
        $status = 'ERROR'
        $detail = $_.Exception.Message
    }
    $results.Add([pscustomobject]@{
        type=$kind; path=$path; status=$status; icon=$iconPath; backup=$backup; detail=$detail
    })
}
$shortcuts = @($results | Where-Object { $_.type -in @('LNK','URL','STEAM_URL') })
$attention = @($shortcuts | Where-Object { $_.status -in @(
    'TARGET_MISSING','BROKEN_ICON_NO_SAFE_SOURCE','MISSING_ICON_REFERENCE',
    'UNKNOWN_ICON_HASH','SOURCE_UNAVAILABLE','DOWNLOAD_UNVERIFIED',
    'REPAIRABLE_TARGET_ICON','LOCAL_ICON_AVAILABLE','AMBIGUOUS_ICON_REFERENCE','ERROR'
)})
$repaired = @($shortcuts | Where-Object { $_.status -eq 'REPAIRED' })
$results.ToArray()
[pscustomobject]@{
    type='SUMMARY'; path=''; status=if ($shortcuts.Count -eq 0) { 'NO_SHORTCUTS_FOUND' } else { 'SCAN_COMPLETE' };
    icon=''; backup=''; detail=''; total=$shortcuts.Count; attention=$attention.Count;
    repaired=$repaired.Count; roots=@($ShortcutRoots); folders_scanned=$foldersExamined
}
