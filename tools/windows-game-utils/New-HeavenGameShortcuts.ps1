#requires -Version 5.1
# Discovers Windows games on a removable SSD and creates shortcuts only when explicitly requested.
[CmdletBinding()]
param(
    [ValidateSet('Preview', 'Create')][string]$Mode = 'Preview',
    [string]$DriveRoot = 'E:\',
    [string]$OutputDirectory = '',
    [string]$SteamExe = '',
    [string]$BattleNetExe = '',
    [ValidateRange(1, 5)][int]$MaxDepth = 4
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $DriveRoot -PathType Container)) {
    throw "DRIVE_NOT_FOUND: $DriveRoot"
}
$root = [IO.Path]::GetFullPath($DriveRoot)
$rootInfo = Get-Item -LiteralPath $root -ErrorAction Stop
if (($rootInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'ROOT_REPARSE_POINT_BLOCKED'
}
if (-not $OutputDirectory) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if ([string]::IsNullOrWhiteSpace($desktop)) { throw 'DESKTOP_UNAVAILABLE' }
    $OutputDirectory = Join-Path (Join-Path $desktop 'Heaven Tools') 'External SSD Games'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) {
    $outputInfo = Get-Item -LiteralPath $output -ErrorAction Stop
    if (-not $outputInfo.PSIsContainer) { throw 'OUTPUT_NOT_DIRECTORY' }
    if (($outputInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'OUTPUT_REPARSE_POINT_BLOCKED'
    }
}

function Find-ExistingFile {
    param([string[]]$Paths)
    foreach ($candidate in $Paths) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and
            (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    return ''
}
function Make-SafeName {
    param([string]$Name)
    $safe = ($Name -replace '[<>:"/\\|?*\x00-\x1F]', '-' -replace '\s+', ' ').Trim(' ', '.')
    if ($safe.Length -gt 90) { $safe = $safe.Substring(0, 90).Trim(' ', '.') }
    if (-not $safe) { return 'Game' }
    return $safe
}

$programFiles86 = [Environment]::GetFolderPath('ProgramFilesX86')
$programFiles = [Environment]::GetFolderPath('ProgramFiles')
$steamCandidates = New-Object 'System.Collections.Generic.List[string]'
if ($SteamExe) {
    $steamCandidates.Add($SteamExe)
} else {
    try {
        $steamRegistry = Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -ErrorAction Stop
        if ($steamRegistry.PSObject.Properties['SteamExe']) {
            $steamCandidates.Add([string]$steamRegistry.SteamExe)
        }
        if ($steamRegistry.PSObject.Properties['SteamPath']) {
            $steamCandidates.Add((Join-Path ([string]$steamRegistry.SteamPath) 'steam.exe'))
        }
    } catch {
        # Steam is optional; the external library can still be scanned.
    }
    if ($programFiles86) { $steamCandidates.Add((Join-Path $programFiles86 'Steam\steam.exe')) }
    if ($programFiles) { $steamCandidates.Add((Join-Path $programFiles 'Steam\steam.exe')) }
}
$steamLauncher = Find-ExistingFile -Paths $steamCandidates.ToArray()
$battleCandidates = New-Object 'System.Collections.Generic.List[string]'
if ($BattleNetExe) {
    $battleCandidates.Add($BattleNetExe)
} else {
    foreach ($prefix in @($programFiles86, $programFiles)) {
        if ($prefix) {
            $battleCandidates.Add((Join-Path $prefix 'Battle.net\Battle.net Launcher.exe'))
            $battleCandidates.Add((Join-Path $prefix 'Battle.net\Battle.net.exe'))
        }
    }
}
$battleLauncher = Find-ExistingFile -Paths $battleCandidates.ToArray()

$games = New-Object 'System.Collections.Generic.List[object]'
$warnings = New-Object 'System.Collections.Generic.List[string]'
$genshinPaths = New-Object 'System.Collections.Generic.List[string]'
$overwatchPaths = New-Object 'System.Collections.Generic.List[string]'
$visited = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$pending = New-Object 'System.Collections.Generic.Queue[object]'
$pending.Enqueue([pscustomobject]@{ path = $root; depth = 0 })

while ($pending.Count -gt 0) {
    $current = $pending.Dequeue()
    $directory = [string]$current.path
    if (-not $visited.Add($directory)) { continue }
    if ($visited.Count -gt 10000) { throw 'SCAN_DIRECTORY_LIMIT_EXCEEDED' }
    $directoryName = Split-Path -Path $directory -Leaf

    if ($directoryName -ieq 'steamapps') {
        $common = [IO.Path]::GetFullPath((Join-Path $directory 'common'))
        $prefix = $common.TrimEnd('\') + '\'
        foreach ($manifest in @(Get-ChildItem -LiteralPath $directory -File -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue)) {
            if ($manifest.BaseName -notmatch '^appmanifest_([0-9]+)$') { continue }
            $appid = $Matches[1]
            if ($manifest.Length -gt 1048576) {
                $warnings.Add("MANIFEST_TOO_LARGE: $($manifest.FullName)")
                continue
            }
            $contents = Get-Content -LiteralPath $manifest.FullName -Raw -ErrorAction Stop
            if ($contents -notmatch '(?m)^\s*"name"\s+"([^"\r\n]{1,180})"\s*$') { continue }
            $gameName = $Matches[1]
            if ($contents -notmatch '(?m)^\s*"installdir"\s+"([^"\r\n]{1,240})"\s*$') { continue }
            $installName = $Matches[1]
            if ([IO.Path]::IsPathRooted($installName) -or $installName -match '(^|[\\/])\.\.([\\/]|$)') {
                $warnings.Add("UNSAFE_MANIFEST_PATH: $($manifest.Name)")
                continue
            }
            try {
                $installPath = [IO.Path]::GetFullPath((Join-Path $common $installName))
            } catch {
                $warnings.Add("INVALID_MANIFEST_PATH: $($manifest.Name)")
                continue
            }
            if (-not $installPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-Path -LiteralPath $installPath -PathType Container)) { continue }
            if (-not $steamLauncher) {
                $warnings.Add("STEAM_LAUNCHER_NOT_FOUND: $gameName")
                continue
            }
            $icon = Join-Path (Join-Path (Split-Path -Path $steamLauncher -Parent) 'steam\games') ($appid + '.ico')
            if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { $icon = $steamLauncher }
            $games.Add([pscustomobject]@{
                name = $gameName; kind = 'steam'; install_path = $installPath
                shortcut_name = ((Make-SafeName $gameName) + " (Steam $appid).lnk")
                target = $steamLauncher; arguments = "-applaunch $appid"
                workdir = (Split-Path -Path $steamLauncher -Parent); icon = $icon
            })
        }
        # Game content under steamapps/common is already represented by its manifest.
        continue
    }

    $genshinExe = Join-Path $directory 'GenshinImpact.exe'
    if (Test-Path -LiteralPath $genshinExe -PathType Leaf) { $genshinPaths.Add($genshinExe) }
    $owExe = Join-Path $directory '_retail_\Overwatch.exe'
    if (-not (Test-Path -LiteralPath $owExe -PathType Leaf)) {
        $owExe = Join-Path $directory 'Overwatch.exe'
    }
    if (Test-Path -LiteralPath $owExe -PathType Leaf) { $overwatchPaths.Add($owExe) }
    if ([int]$current.depth -ge $MaxDepth) { continue }

    try {
        $children = @(Get-ChildItem -LiteralPath $directory -Directory -ErrorAction Stop)
    } catch {
        $warnings.Add("UNREADABLE_DIRECTORY: $directory")
        continue
    }
    foreach ($child in $children) {
        if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        if ($child.Name -in @('_retail_', 'GenshinImpact_Data', 'node_modules', '.git')) { continue }
        $pending.Enqueue([pscustomobject]@{ path = $child.FullName; depth = ([int]$current.depth + 1) })
    }
}

if ($genshinPaths.Count -eq 1) {
    $gameExe = $genshinPaths[0]
    $games.Add([pscustomobject]@{
        name = 'Genshin Impact'; kind = 'genshin'; install_path = (Split-Path -Path $gameExe -Parent)
        shortcut_name = 'Genshin Impact.lnk'; target = $gameExe; arguments = ''
        workdir = (Split-Path -Path $gameExe -Parent); icon = $gameExe
    })
} elseif ($genshinPaths.Count -gt 1) {
    $warnings.Add('MULTIPLE_GENSHIN_INSTALLATIONS: no Genshin shortcut created')
}
if ($overwatchPaths.Count -eq 1 -and $battleLauncher) {
    $owExe = $overwatchPaths[0]
    $games.Add([pscustomobject]@{
        name = 'Overwatch'; kind = 'battle.net'; install_path = (Split-Path -Path $owExe -Parent)
        shortcut_name = 'Overwatch (Battle.net).lnk'; target = $battleLauncher
        arguments = '--exec="launch Pro"'
        workdir = (Split-Path -Path $battleLauncher -Parent); icon = $owExe
    })
} elseif ($overwatchPaths.Count -gt 1) {
    $warnings.Add('MULTIPLE_OVERWATCH_INSTALLATIONS: no Battle.net shortcut created')
} elseif ($overwatchPaths.Count -eq 1) {
    $warnings.Add('BATTLENET_LAUNCHER_NOT_FOUND: no Overwatch shortcut created')
}

$created = 0
$reused = 0
$skipped = 0
$items = New-Object 'System.Collections.Generic.List[object]'
$shell = $null
if ($Mode -eq 'Create' -and $games.Count -gt 0) {
    New-Item -ItemType Directory -Path $output -Force -ErrorAction Stop | Out-Null
    $shell = New-Object -ComObject WScript.Shell
}
foreach ($game in @($games | Sort-Object kind, name, install_path)) {
    $linkPath = Join-Path $output $game.shortcut_name
    $action = 'would_create'
    if ($Mode -eq 'Preview') {
        if (Test-Path -LiteralPath $linkPath) { $action = 'existing_not_verified' }
    } elseif (Test-Path -LiteralPath $linkPath) {
        $existing = $shell.CreateShortcut($linkPath)
        if ([string]::Equals([string]$existing.TargetPath, [string]$game.target, [StringComparison]::OrdinalIgnoreCase) -and
            [string]::Equals([string]$existing.Arguments, [string]$game.arguments, [StringComparison]::Ordinal)) {
            $action = 'reused'
            $reused += 1
        } else {
            $action = 'collision_skipped'
            $skipped += 1
            $warnings.Add("SHORTCUT_COLLISION: $linkPath")
        }
    } else {
        $shortcut = $shell.CreateShortcut($linkPath)
        $shortcut.TargetPath = $game.target
        $shortcut.Arguments = $game.arguments
        $shortcut.WorkingDirectory = $game.workdir
        $shortcut.Description = 'Heaven external SSD game: ' + $game.name
        $shortcut.IconLocation = $game.icon + ',0'
        $shortcut.Save()
        $check = $shell.CreateShortcut($linkPath)
        if (-not [string]::Equals([string]$check.TargetPath, [string]$game.target, [StringComparison]::OrdinalIgnoreCase) -or
            -not [string]::Equals([string]$check.Arguments, [string]$game.arguments, [StringComparison]::Ordinal)) {
            throw "SHORTCUT_READBACK_FAILED: $linkPath"
        }
        $action = 'created'
        $created += 1
    }
    $items.Add([pscustomobject]@{
        name = $game.name; kind = $game.kind; install_path = $game.install_path
        shortcut = $linkPath; action = $action
    })
}
[pscustomobject]@{
    schema = 'heaven-toolbox/game-shortcuts/v1'
    host = [Environment]::MachineName
    mode = $Mode
    drive_root = $root
    output_directory = $output
    created = $created
    reused = $reused
    skipped = $skipped
    games = $items.ToArray()
    warnings = $warnings.ToArray()
} | ConvertTo-Json -Depth 6 -Compress
