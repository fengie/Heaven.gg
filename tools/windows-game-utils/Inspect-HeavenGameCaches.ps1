# Read-only bounded cache inventory. No file content leaves the machine.
#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ManifestPath='',
    [string]$TestFixtureRoot='',
    [ValidateRange(1,50000)][int]$MaxEntries=10000,
    [ValidateRange(1,300)][int]$MaxSeconds=30
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Cache-Placement.Common.ps1')
Assert-CacheContext -TestFixtureRoot $TestFixtureRoot
$entries=New-Object 'System.Collections.Generic.List[object]'
if(-not $TestFixtureRoot) {
    $managed=@(
        @('nvidia-dx','NVIDIA driver', (Join-Path $env:LOCALAPPDATA 'NVIDIA\DXCache')),
        @('nvidia-gl','NVIDIA driver', (Join-Path $env:LOCALAPPDATA 'NVIDIA\GLCache')),
        @('nvidia-legacy','NVIDIA driver', (Join-Path $env:LOCALAPPDATA 'NVIDIA Corporation\NV_Cache')),
        @('windows-d3d','Windows D3D', (Join-Path $env:LOCALAPPDATA 'D3DSCache'))
    )
    foreach($row in $managed) {
        $entries.Add([pscustomobject]@{id=$row[0];owner=$row[1];source=$row[2];managed=$true})
    }
    # Bounded optional Steam candidates; do not parse arbitrary libraries or crawl C:.
    foreach($root in @('C:\Program Files (x86)\Steam\steamapps\shadercache',
                      'E:\SteamLibrary\steamapps\shadercache',
                      'E:\Steam\steamapps\shadercache')) {
        if(Test-Path -LiteralPath $root -PathType Container) {
            $id='steam-shader-'+([char][int]$root[0]).ToString().ToLowerInvariant()
            $entries.Add([pscustomobject]@{id=$id;owner='Steam library';source=$root;managed=$true})
        }
    }
}
if($ManifestPath) {
    $manifest=Read-CachePlacementManifest -ManifestPath $ManifestPath
    foreach($entry in @($manifest.entries)) {
        $entries.Add([pscustomobject]@{id=[string]$entry.id;owner=[string]$entry.owner;
            source=[string]$entry.source;managed=$false})
    }
}
$results=New-Object 'System.Collections.Generic.List[object]'
foreach($entry in $entries) {
    $exists=Test-Path -LiteralPath $entry.source -PathType Container
    $row=[ordered]@{
        id=$entry.id;owner=$entry.owner
        exists=[bool]$exists;bytes=$null;complete=$false
        decision=if($entry.managed) {
            if($entry.owner -eq 'Steam library' -and $entry.source.StartsWith('E:\',[StringComparison]::OrdinalIgnoreCase)) {
                'ALREADY_ON_E'
            } elseif($entry.owner -eq 'Steam library') {
                'LIBRARY_MANAGED'
            } else {'MANAGED_LEAVE_C'}
        } else {'UNKNOWN_HOLD'}
        reason=if($exists){'NOT_INSPECTED'}else{'SOURCE_MISSING'}
    }
    if($exists) {
        try {
            Assert-CacheAncestors -Path $entry.source
            if($TestFixtureRoot -and -not (Test-CacheWithin $entry.source $TestFixtureRoot)) {
                throw 'FIXTURE_PATH_ESCAPE'
            }
            $snapshot=Get-CacheTreeSnapshot -Root $entry.source -MaxEntries $MaxEntries -MaxSeconds $MaxSeconds
            if($snapshot.complete) {
                $row.bytes=[long]$snapshot.bytes
                $row.complete=$true
                $row.reason='MEASURED'
                if(-not $entry.managed) {$row.decision='PILOT_REVIEW_REQUIRED'}
            }else {
                $row.reason='BOUNDED_SCAN_TRUNCATED'
            }
        }catch{
            # Do not leak file contents, paths, or exception details in reports.
            $row.reason='ACCESS_OR_REPARSE_UNSAFE'
            $row.bytes=$null
            $row.complete=$false
        }
    }
    $results.Add([pscustomobject]$row)
}
[pscustomobject]@{
    schema='heaven-toolbox/game-cache-placement/v1'
    host=[string]$env:COMPUTERNAME
    mode='Inventory'
    effects=$false
    complete=(@($results | Where-Object { $_.exists -and -not $_.complete }).Count -eq 0)
    candidates=@($results.ToArray())
} | ConvertTo-Json -Depth 6 -Compress
