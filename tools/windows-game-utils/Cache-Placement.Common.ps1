# Shared read-only validation and bounded accounting for game cache placement.
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CacheFullPath {
    param([Parameter(Mandatory)][string]$Path)
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path.Contains('..') -or
        $Path.Contains('/') -or $Path.Contains('*') -or $Path.Contains('?')) {
        throw 'LOCAL_ABSOLUTE_PATH_REQUIRED'
    }
    $full=[IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full.Length -le 3) {throw 'DRIVE_ROOT_FORBIDDEN'}
    return $full
}
function Test-CacheWithin {
    param([string]$Child,[string]$Parent)
    $a=(Get-CacheFullPath $Child)
    $b=(Get-CacheFullPath $Parent)
    return $a.StartsWith($b+'\', [StringComparison]::OrdinalIgnoreCase)
}
function Assert-CacheAncestors {
    param([string]$Path,[switch]$AllowLeafJunction)
    $full=Get-CacheFullPath $Path
    $root=[IO.Path]::GetPathRoot($full)
    $current=$root
    $segments=$full.Substring($root.Length).Split([char]'\')
    foreach($segment in $segments) {
        if (-not $segment) {continue}
        $current=Join-Path $current $segment
        $isLeaf=[string]::Equals($current,$full,[StringComparison]::OrdinalIgnoreCase)
        $item=Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if($null -eq $item) {continue}
        if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            if($AllowLeafJunction -and $isLeaf -and [string]$item.LinkType -eq 'Junction') {continue}
            throw 'REPARSE_UNSAFE'
        }
        if(-not $isLeaf -and -not $item.PSIsContainer) {throw 'PARENT_NOT_DIRECTORY'}
    }
}
function Assert-CacheContext {
    param([string]$TestFixtureRoot='')
    if($TestFixtureRoot) {
        if($env:HEAVEN_CACHE_FIXTURE_TEST -ne '1') {throw 'FIXTURE_NOT_AUTHORIZED'}
        $temp=([IO.Path]::GetFullPath([IO.Path]::GetTempPath())).TrimEnd('\')
        $fixture=Get-CacheFullPath $TestFixtureRoot
        if(-not $fixture.StartsWith((Join-Path $temp 'heaven-cache-fixture-'),
            [StringComparison]::OrdinalIgnoreCase)) {throw 'FIXTURE_ROOT_OUTSIDE_TEMP'}
        if(-not (Test-Path -LiteralPath $fixture -PathType Container)) {throw 'FIXTURE_ROOT_MISSING'}
        Assert-CacheAncestors $fixture
        return
    }
    if($env:COMPUTERNAME -ine 'HEAVEN2') {throw 'HEAVEN2_REQUIRED'}
    $ident=[Security.Principal.WindowsIdentity]::GetCurrent()
    $p=New-Object Security.Principal.WindowsPrincipal($ident)
    if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'NORMAL_EXPLORER_USER_REQUIRED'
    }
}
function Assert-CacheSourceAndTarget {
    param([object]$Entry,[string]$TestFixtureRoot='',[switch]$AllowLinkedSource)
    $src=Get-CacheFullPath ([string]$Entry.source)
    $dst=Get-CacheFullPath ([string]$Entry.target)
    if([string]::Equals($src,$dst,[StringComparison]::OrdinalIgnoreCase) -or
        (Test-CacheWithin $dst $src) -or (Test-CacheWithin $src $dst)) {
        throw 'SOURCE_TARGET_OVERLAP'
    }
    if($TestFixtureRoot) {
        if(-not (Test-CacheWithin $src $TestFixtureRoot) -or
            -not (Test-CacheWithin $dst $TestFixtureRoot)) {throw 'FIXTURE_PATH_ESCAPE'}
        if(-not (Test-CacheWithin $src (Join-Path $TestFixtureRoot 'source')) -or
            -not (Test-CacheWithin $dst (Join-Path $TestFixtureRoot 'target'))) {
            throw 'FIXTURE_PATH_SCOPE'
        }
    } else {
        if($src.Substring(0,2) -ine 'C:') {throw 'SOURCE_NOT_INTERNAL_C'}
        if(-not (Test-CacheWithin $src $env:LOCALAPPDATA)) {throw 'SOURCE_NOT_USER_CACHE'}
        $relative=$src.Substring($env:LOCALAPPDATA.TrimEnd('\').Length+1)
        if($relative.Split([char]'\').Count -lt 2) {throw 'SOURCE_ROOT_TOO_BROAD'}
        if($relative -match '(?i)(^|\\)(NVIDIA|D3DSCache|Microsoft|Packages|Temp|CrashDumps)(\\|$)') {
            throw 'MANAGED_CACHE_FORBIDDEN'
        }
        $prefix='E:\GameCaches'
        if(-not (Test-CacheWithin $dst $prefix)) {throw 'TARGET_NOT_GAMECACHE_ROOT'}
        $srcVol=Get-Volume -DriveLetter C -ErrorAction Stop
        $dstVol=Get-Volume -DriveLetter E -ErrorAction Stop
        if($srcVol.FileSystem -ne 'NTFS' -or $dstVol.FileSystem -ne 'NTFS') {throw 'NTFS_REQUIRED'}
        $disk=Get-Partition -DriveLetter E -ErrorAction Stop | Get-Disk -ErrorAction Stop
        if($disk.IsBoot -or $disk.IsSystem -or
            $disk.BusType -in @('File Backed Virtual','iSCSI','Unknown')) {
            throw 'EXTERNAL_SSD_IDENTITY_NOT_VERIFIED'
        }
        if([string]::IsNullOrWhiteSpace([string]$dstVol.UniqueId) -or
            -not [string]::Equals([string]$dstVol.UniqueId,[string]$Entry.target_volume_id,
                [StringComparison]::OrdinalIgnoreCase)) {throw 'TARGET_VOLUME_CHANGED'}
    }
    Assert-CacheAncestors -Path $src -AllowLeafJunction:$AllowLinkedSource
    Assert-CacheAncestors $dst
}
function Read-CachePlacementManifest {
    param([Parameter(Mandatory)][string]$ManifestPath)
    $meta=Get-Item -LiteralPath $ManifestPath -Force -ErrorAction Stop
    if($meta.PSIsContainer -or
        ($meta.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $meta.Length -gt 65536) {throw 'MANIFEST_UNSAFE'}
    $obj=Get-Content -LiteralPath $ManifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if($obj.schema -cne 'heaven-toolbox/game-cache-manifest/v1' -or
        $null -eq $obj.entries -or @($obj.entries).Count -gt 32) {throw 'MANIFEST_SCHEMA_INVALID'}
    $ids=@{}
    foreach($entry in @($obj.entries)) {
        $id=[string]$entry.id
        if($id -cnotmatch '^[a-z][a-z0-9-]{1,47}$' -or $ids.ContainsKey($id)) {
            throw 'INVALID_OR_DUPLICATE_CACHE_ID'
        }
        $ids[$id]=$true
        if([string]$entry.kind -cne 'game-owned' -or
            [string]$entry.owner -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$' -or
            [string]::IsNullOrWhiteSpace([string]$entry.target_volume_id)) {
            throw 'UNTRUSTED_CACHE_OWNER'
        }
        [void](Get-CacheFullPath ([string]$entry.source))
        [void](Get-CacheFullPath ([string]$entry.target))
    }
    return $obj
}
function Get-CacheTreeSnapshot {
    param([string]$Root,[switch]$HashFiles,[int]$MaxEntries=10000,
          [long]$MaxBytes=42949672960,[int]$MaxSeconds=45)
    $rootFull=Get-CacheFullPath $Root
    Assert-CacheAncestors $rootFull
    if(-not (Test-Path -LiteralPath $rootFull -PathType Container)) {throw 'CACHE_SOURCE_MISSING'}
    $stack=New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($rootFull)
    $paths=New-Object 'System.Collections.Generic.List[string]'
    $count=0; $total=[long]0; $complete=$true
    $limit=[Diagnostics.Stopwatch]::StartNew()
    while($stack.Count -gt 0) {
        if($limit.Elapsed.TotalSeconds -gt $MaxSeconds) {$complete=$false;break}
        $dir=$stack.Pop()
        $children=@(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop)
        foreach($item in $children) {
            $count++
            if($count -gt $MaxEntries -or $limit.Elapsed.TotalSeconds -gt $MaxSeconds) {
                $complete=$false;break
            }
            if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'REPARSE_UNSAFE'
            }
            if($item.PSIsContainer) {
                if($HashFiles) {
                    # Empty directory additions/removals are durable state.
                    $dirRelative=$item.FullName.Substring($rootFull.Length+1)
                    $paths.Add('D|'+$dirRelative)
                }
                $stack.Push($item.FullName)
            } else {
                $total += [long]$item.Length
                if($total -gt $MaxBytes) {$complete=$false;break}
                if($HashFiles) {
                    $relative=$item.FullName.Substring($rootFull.Length+1)
                    $hash=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256 -ErrorAction Stop).Hash
                    $paths.Add('F|'+$relative+'|'+$item.Length+'|'+$hash)
                }
            }
        }
        if(-not $complete) {break}
    }
    if(-not $complete) {
        return [pscustomobject]@{complete=$false;bytes=$null;count=$null;digest=$null}
    }
    $digest=$null
    if($HashFiles) {
        $ordered=@($paths.ToArray() | Sort-Object -CaseSensitive)
        $raw=[Text.Encoding]::UTF8.GetBytes([string]::Join([char]10,$ordered))
        $algo=[Security.Cryptography.SHA256]::Create()
        try {$digest=([BitConverter]::ToString($algo.ComputeHash($raw))).Replace('-','').ToLowerInvariant()}
        finally {$algo.Dispose()}
    }
    return [pscustomobject]@{complete=$true;bytes=$total;count=$count;digest=$digest}
}
