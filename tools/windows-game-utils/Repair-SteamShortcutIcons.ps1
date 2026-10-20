# Repairs missing icons on existing Steam .url shortcuts; never moves or launches games.
# Default is read-only. Windows PowerShell 5.1, ordinary interactive user.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [ValidateSet('Inspect', 'Repair')][string]$Mode = 'Inspect',
    [string[]]$ShortcutRoots = @(),
    [string[]]$ShortcutFiles = @(),
    [string[]]$SteamIconRoots = @(),
    [string[]]$SteamLibraryCacheRoots = @(),
    [string]$CacheDirectory = '',
    [string]$BackupDirectory = '',
    [switch]$AllowDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing -ErrorAction Stop

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
if (@($SteamIconRoots).Count -eq 0) {
    # Use the Steam client's own cache, not recursively searching game installations or drives.
    $steam = New-Object 'System.Collections.Generic.List[string]'
    foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
        try {
            $entry = Get-ItemProperty -LiteralPath $key -ErrorAction Stop
            foreach ($property in @('SteamPath', 'InstallPath')) {
                if ($entry.PSObject.Properties[$property] -and $entry.$property) {
                    $steam.Add([string]$entry.$property)
                }
            }
        } catch { } # Steam may be absent or installed in another scope.
    }
    foreach ($folder in @([Environment]::GetEnvironmentVariable('ProgramFiles(x86)'), $env:ProgramFiles)) {
        if ($folder) { $steam.Add((Join-Path $folder 'Steam')) }
    }
    $SteamIconRoots = @($steam | Where-Object { $_ } | Select-Object -Unique |
        ForEach-Object { Join-Path $_ 'steam\games' })
}

# Steam's librarycache contains a separate local artwork copy, including when the
# old hashed steam\games ICO vanished during migration.
if (@($SteamLibraryCacheRoots).Count -eq 0) {
    $SteamLibraryCacheRoots = @(
        foreach ($root in $SteamIconRoots) {
            if ($root -match '(?i)[\\/]steam[\\/]games[\\/]?$') {
                Join-Path (Split-Path (Split-Path $root -Parent) -Parent) 'appcache\librarycache'
            }
        }
    )
}

# Avoid relying on PNG-compressed ICO compatibility in legacy GDI+ decoders.
# Create a classic Windows icon from a cropped bitmap and release its GDI handle.
if (-not ('HeavenSteamIconInterop' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HeavenSteamIconInterop {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool DestroyIcon(IntPtr icon);
}
'@ -ErrorAction Stop
}

function Convert-ImageToIconFile {
    param([string]$ImagePath, [string]$Destination)
    if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) { throw 'ARTWORK_NOT_FOUND' }
    if ((Get-Item -LiteralPath $ImagePath).Length -gt 16777216) { throw 'ARTWORK_TOO_LARGE' }
    $image = $null; $bitmap = $null; $graphics = $null
    $icon = $null; $handle = [IntPtr]::Zero; $stream = $null
    $partial = Join-Path (Split-Path $Destination -Parent) ([guid]::NewGuid().ToString('N') + '.partial')
    try {
        $image = [Drawing.Image]::FromFile($ImagePath)
        if ($image.Width -lt 1 -or $image.Height -lt 1 -or
            $image.Width -gt 4096 -or $image.Height -gt 4096) { throw 'ARTWORK_DIMENSIONS_INVALID' }
        $bitmap = [Drawing.Bitmap]::new(64,64)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $side = [Math]::Min($image.Width, $image.Height)
        $src = [Drawing.Rectangle]::new(
            [int][Math]::Floor(($image.Width - $side) / 2),
            [int][Math]::Floor(($image.Height - $side) / 2),
            [int]$side,[int]$side)
        $dst = [Drawing.Rectangle]::new(0,0,64,64)
        $graphics.DrawImage($image,$dst,$src,[Drawing.GraphicsUnit]::Pixel)
        $handle = $bitmap.GetHicon()
        if ($handle -eq [IntPtr]::Zero) { throw 'ARTWORK_ICON_HANDLE_FAILED' }
        $icon = [Drawing.Icon]::FromHandle($handle)
        $stream = [IO.File]::Create($partial)
        $icon.Save($stream)
        $stream.Dispose(); $stream=$null
        if (-not (Test-ValidSteamIcon -File $partial)) { throw 'GENERATED_ICON_UNDECODABLE' }
        if (Test-Path -LiteralPath $Destination) { throw 'ARTWORK_CACHE_COLLISION' }
        [IO.File]::Move($partial,$Destination)
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $icon) { $icon.Dispose() }
        if ($handle -ne [IntPtr]::Zero) { [void][HeavenSteamIconInterop]::DestroyIcon($handle) }
        if ($null -ne $graphics) { $graphics.Dispose() }
        if ($null -ne $bitmap) { $bitmap.Dispose() }
        if ($null -ne $image) { $image.Dispose() }
        Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
    }
}

function Test-ValidSteamIcon {
    param([string]$File)
    if (-not $File -or -not (Test-Path -LiteralPath $File -PathType Leaf)) { return $false }
    try {
        $info = Get-Item -LiteralPath $File -ErrorAction Stop
        if ($info.Length -lt 26 -or $info.Length -gt 16777216) { return $false }
        $bytes = [IO.File]::ReadAllBytes($File)
        if ($bytes[0] -ne 0 -or $bytes[1] -ne 0 -or $bytes[2] -ne 1 -or $bytes[3] -ne 0) { return $false }
        $count = [BitConverter]::ToUInt16($bytes, 4)
        if ($count -eq 0 -or $count -gt 64 -or $bytes.Length -lt (6 + 16 * $count)) { return $false }
        for ($i = 0; $i -lt $count; $i++) {
            $offset = 6 + 16 * $i
            $length = [uint64][BitConverter]::ToUInt32($bytes, $offset + 8)
            $position = [uint64][BitConverter]::ToUInt32($bytes, $offset + 12)
            if ($length -gt 0 -and $position -ge (6 + 16 * $count) -and
                ($position + $length) -le $bytes.Length) {
                # A directory entry alone does not mean the ICO image is decodable.
                # Reject truncated/malformed image resources before using them.
                $icon = $null
                $bitmap = $null
                try {
                    $icon = [System.Drawing.Icon]::new($File)
                    $bitmap = $icon.ToBitmap()
                    return ($bitmap.Width -gt 0 -and $bitmap.Height -gt 0)
                } catch {
                    return $false
                } finally {
                    if ($null -ne $bitmap) { $bitmap.Dispose() }
                    if ($null -ne $icon) { $icon.Dispose() }
                }
            }
        }
    } catch { }
    return $false
}

function Read-ShortcutText {
    param([string]$File)
    $bytes = [IO.File]::ReadAllBytes($File)
    if ($bytes.Length -gt 65536) { throw 'SHORTCUT_TOO_LARGE' }
    # Byte-preserving encoding for BOM-less .url files: avoid mutating unrelated
    # ANSI/UTF-8 bytes when changing an ASCII IconFile reference.
    $encoding = [Text.Encoding]::GetEncoding(28591)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 255 -and $bytes[1] -eq 254) {
        $encoding = [Text.Encoding]::Unicode
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 254 -and $bytes[1] -eq 255) {
        $encoding = [Text.Encoding]::BigEndianUnicode
    } elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
        $encoding = New-Object System.Text.UTF8Encoding($true)
    }
    $text = $encoding.GetString($bytes)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xfeff) { $text = $text.Substring(1) }
    [pscustomobject]@{ Text = $text; Encoding = $encoding; Bytes = $bytes }
}

$reports = New-Object 'System.Collections.Generic.List[object]'
$files = New-Object 'System.Collections.Generic.List[object]'
if ($PSBoundParameters.ContainsKey('ShortcutFiles')) {
    if (@($ShortcutFiles).Count -gt 5000) { throw 'SCAN_FILE_LIMIT_EXCEEDED' }
    foreach ($path in @($ShortcutFiles | Where-Object { $_ } | Select-Object -Unique)) {
        if (-not [IO.Path]::IsPathRooted($path) -or [IO.Path]::GetExtension($path) -ine '.url') {
            throw 'INVALID_SHORTCUT_FILE'
        }
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $item = Get-Item -LiteralPath $path -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
                $files.Add($item)
            }
        } else {
            $reports.Add([pscustomobject]@{ shortcut = $path; app_id = ''; status = 'SHORTCUT_FILE_UNAVAILABLE'; icon = ''; backup = '' })
        }
    }
} else {
    foreach ($root in @($ShortcutRoots | Where-Object { $_ } | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) {
            $reports.Add([pscustomobject]@{ shortcut = $root; app_id = ''; status = 'ROOT_UNAVAILABLE'; icon = ''; backup = '' })
            continue
        }
        try {
            foreach ($item in (Get-ChildItem -LiteralPath $root -Filter '*.url' -File -Recurse -ErrorAction Stop)) {
                $files.Add($item)
            }
        } catch {
            $reports.Add([pscustomobject]@{ shortcut = $root; app_id = ''; status = 'ROOT_SCAN_ERROR'; icon = ''; backup = ''; detail = $_.Exception.Message })
        }
    }
}

foreach ($item in @($files | Sort-Object FullName -Unique)) {
    $appId = ''
    try {
        # Never follow an individually linked shortcut to a location outside the requested Desktop roots.
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        $data = Read-ShortcutText -File $item.FullName
        $text = $data.Text
        if ($text -notmatch '(?im)^\[InternetShortcut\][ \t]*\r?$') { continue }
        $url = [regex]::Match($text, '(?im)^URL[ \t]*=[ \t]*steam://(?:rungameid|run)/([0-9]{1,20})[ \t]*\r?$')
        if (-not $url.Success) { continue }
        $appId = $url.Groups[1].Value
        $iconFields = [regex]::Matches($text, '(?im)^IconFile[ \t]*=[^\r\n]*')
        if ($iconFields.Count -gt 1) {
            $reports.Add([pscustomobject]@{ shortcut=$item.FullName; app_id=$appId; status='AMBIGUOUS_ICON_REFERENCE'; icon=''; backup='' })
            continue
        }
        $iconField = if ($iconFields.Count -eq 1) { $iconFields[0] } else { $null }
        $oldIcon = if ($null -ne $iconField) {
            $iconField.Value.Substring($iconField.Value.IndexOf('=') + 1).Trim().Trim('"')
        } else { '' }
        $checkPath = [Environment]::ExpandEnvironmentVariables($oldIcon)
        if ($checkPath -and -not [IO.Path]::IsPathRooted($checkPath)) {
            $checkPath = Join-Path $item.DirectoryName $checkPath
        }
        if (Test-ValidSteamIcon -File $checkPath) {
            $reports.Add([pscustomobject]@{ shortcut = $item.FullName; app_id = $appId; status = 'UNCHANGED'; icon = $checkPath; backup = '' })
            continue
        }
        $name = [IO.Path]::GetFileName($oldIcon)
        $knownHash = ($name -match '^[a-f0-9]{32,64}\.ico$')
        $source = ''
        $artSource = ''
        $cached = if ($knownHash) { Join-Path $CacheDirectory ($appId + '-' + $name) } else { '' }
        $artIco = Join-Path $CacheDirectory ($appId + '-library-art.ico')
        if ($knownHash) {
            foreach ($root in @($SteamIconRoots | Where-Object { $_ } | Select-Object -Unique)) {
                $candidate = Join-Path $root $name
                if (Test-ValidSteamIcon -File $candidate) { $source = $candidate; break }
            }
            if (-not $source -and (Test-ValidSteamIcon -File $cached)) { $source = $cached }
        }
        if (-not $source -and (Test-ValidSteamIcon -File $artIco)) { $source = $artIco }
        if (-not $source) {
            foreach ($root in @($SteamLibraryCacheRoots | Where-Object { $_ } | Select-Object -Unique)) {
                $candidates = @(
                    (Join-Path $root ($appId + '_icon.png')),
                    (Join-Path $root ($appId + '_icon.jpg')),
                    (Join-Path $root ($appId + '_icon.jpeg')),
                    (Join-Path (Join-Path $root $appId) 'icon.png'),
                    (Join-Path (Join-Path $root $appId) 'icon.jpg'),
                    (Join-Path (Join-Path $root $appId) 'icon.jpeg')
                )
                foreach ($candidate in $candidates) {
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                        $artSource = $candidate
                        break
                    }
                }
                if ($artSource) { break }
            }
        }
        if ($Mode -eq 'Inspect') {
            $status = if ($source) { 'LOCAL_ICON_AVAILABLE' }
                elseif ($artSource) { 'LOCAL_ARTWORK_AVAILABLE' }
                elseif ($AllowDownload) { 'DOWNLOAD_UNVERIFIED' }
                elseif (-not $oldIcon) { 'MISSING_ICON_REFERENCE' }
                elseif (-not $knownHash) { 'UNKNOWN_ICON_HASH' }
                else { 'SOURCE_UNAVAILABLE' }
            $reports.Add([pscustomobject]@{ shortcut = $item.FullName; app_id = $appId; status = $status; icon = $source; backup = '' })
            continue
        }
        if (-not $source -and -not $artSource -and -not $AllowDownload) {
            $status = if (-not $oldIcon) { 'MISSING_ICON_REFERENCE' }
                elseif (-not $knownHash) { 'UNKNOWN_ICON_HASH' } else { 'SOURCE_UNAVAILABLE' }
            $reports.Add([pscustomobject]@{ shortcut = $item.FullName; app_id = $appId; status = $status; icon = ''; backup = '' })
            continue
        }
        if (-not $PSCmdlet.ShouldProcess($item.FullName, 'Back up and replace broken Steam shortcut icon reference')) {
            $reports.Add([pscustomobject]@{ shortcut = $item.FullName; app_id = $appId; status = 'WHATIF'; icon = $source; backup = '' })
            continue
        }
        if (-not $source) {
            New-Item -ItemType Directory -Path $CacheDirectory -Force -ErrorAction Stop | Out-Null
            if ($artSource) {
                Convert-ImageToIconFile -ImagePath $artSource -Destination $artIco
                $source = $artIco
            } else {
                $downloadFailures = New-Object 'System.Collections.Generic.List[string]'
                if ($knownHash) {
                    # Exact original Steam shortcut icon, when the old hash is known.
                    $urls = @(
                        "https://shared.fastly.steamstatic.com/community_assets/images/apps/$appId/$name",
                        "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/$appId/$name"
                    )
                    foreach ($remote in $urls) {
                        $download = Join-Path $CacheDirectory ([guid]::NewGuid().ToString('N') + '.partial')
                        try {
                            Invoke-WebRequest -Uri $remote -OutFile $download -TimeoutSec 12 -UseBasicParsing -ErrorAction Stop | Out-Null
                            if (-not (Test-ValidSteamIcon -File $download)) { throw 'INVALID_DOWNLOADED_ICON' }
                            if (Test-Path -LiteralPath $cached) { throw 'CACHE_TARGET_COLLISION' }
                            Move-Item -LiteralPath $download -Destination $cached -ErrorAction Stop
                            $source = $cached
                            break
                        } catch { $downloadFailures.Add([string]$_.Exception.Message) }
                        finally { Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue }
                    }
                }
                if (-not $source) {
                    # Explicitly opted-in fall back to Valve-hosted store artwork.
                    # This is cover art converted to an icon, not the original app icon.
                    $artUrls = @(
                        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/$appId/capsule_184x69.jpg",
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/$appId/capsule_184x69.jpg"
                    )
                    foreach ($remote in $artUrls) {
                        $download = Join-Path $CacheDirectory ([guid]::NewGuid().ToString('N') + '.partial')
                        try {
                            Invoke-WebRequest -Uri $remote -OutFile $download -MaximumRedirection 0 -TimeoutSec 12 -UseBasicParsing -ErrorAction Stop | Out-Null
                            Convert-ImageToIconFile -ImagePath $download -Destination $artIco
                            $source = $artIco
                            break
                        } catch { $downloadFailures.Add([string]$_.Exception.Message) }
                        finally { Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue }
                    }
                }
                if (-not $source) {
                    throw ('STEAM_ICON_DOWNLOAD_FAILED: ' + ($downloadFailures.ToArray() -join '; '))
                }
            }
        }

        # A CDN request can take seconds; preserve an external editor's work.
        # This is a best-effort race guard, not an OS-level compare-and-swap.
        if ((Get-Item -LiteralPath $item.FullName -ErrorAction Stop).Attributes -band
            [IO.FileAttributes]::ReparsePoint) { throw 'SHORTCUT_CHANGED_TO_REPARSE_POINT' }
        if (-not [System.Collections.StructuralComparisons]::StructuralEqualityComparer.Equals(
            $data.Bytes, [IO.File]::ReadAllBytes($item.FullName))) {
            throw 'SHORTCUT_CHANGED_DURING_REPAIR'
        }
        if ($null -ne $iconField) {
            $updated = $text.Substring(0, $iconField.Index) + 'IconFile=' + $source +
                $text.Substring($iconField.Index + $iconField.Length)
        } else {
            $newline = if ($text.Contains([string][char]13 + [string][char]10)) {
                [string][char]13 + [string][char]10
            } else { [string][char]10 }
            $separator = if ($text.EndsWith([string][char]10)) { '' } else { $newline }
            $updated = $text + $separator + 'IconFile=' + $source + $newline
        }
        # Fail closed if this file's encoding cannot represent the new path.
        if ($data.Encoding.GetString($data.Encoding.GetBytes($updated)) -cne $updated) {
            throw 'ICON_PATH_ENCODING_UNREPRESENTABLE'
        }
        New-Item -ItemType Directory -Path $BackupDirectory -Force -ErrorAction Stop | Out-Null
        $backup = Join-Path $BackupDirectory ([guid]::NewGuid().ToString('N') + '-' + $item.Name + '.bak')
        [IO.File]::Copy($item.FullName, $backup, $false)
        $temporary = Join-Path $item.DirectoryName ('.heaven-steam-' + [guid]::NewGuid().ToString('N') + '.tmp')
        $swapBackup = Join-Path $item.DirectoryName ('.heaven-steam-swap-' + [guid]::NewGuid().ToString('N') + '.bak')
        try {
            [IO.File]::WriteAllText($temporary, $updated, $data.Encoding)
            if (-not [System.Collections.StructuralComparisons]::StructuralEqualityComparer.Equals(
                $data.Bytes, [IO.File]::ReadAllBytes($item.FullName))) {
                throw 'SHORTCUT_CHANGED_DURING_REPAIR'
            }
            # .NET Framework on Windows PowerShell 5.1 requires a legal backup path.
            # This same-volume swap backup is temporary; the user backup above is retained.
            [IO.File]::Replace($temporary, $item.FullName, $swapBackup)
        } finally {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $swapBackup -Force -ErrorAction SilentlyContinue
        }
        $reports.Add([pscustomobject]@{ shortcut = $item.FullName; app_id = $appId; status = 'REPAIRED'; icon = $source; backup = $backup })
    } catch {
        $reports.Add([pscustomobject]@{ shortcut = $item.FullName; app_id = $appId; status = 'ERROR'; icon = ''; backup = ''; detail = $_.Exception.Message })
    }
}
$reports.ToArray()
