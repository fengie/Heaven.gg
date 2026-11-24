#requires -Version 5.1
[CmdletBinding()]
param(
 [string]$RepoRoot=(Join-Path $PSScriptRoot '..'),
 [Parameter(Mandatory=$true)][string]$ExpectedSourceSha
)
$ErrorActionPreference='Stop'
if([Environment]::MachineName -ine 'HEAVEN' -or $ExpectedSourceSha -cnotmatch '^[a-f0-9]{40}$'){throw 'HEAVEN1_EXACT_SOURCE_REQUIRED'}
$raw=@(& (Join-Path $PSScriptRoot 'Apply-HeavenGg.ps1') -RepoRoot $RepoRoot -Mode Status)
$proof=($raw -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
if($proof.schema -cne 'heaven.gg/private-host/v1' -or $proof.host -cne 'HEAVEN' -or $proof.status -cne 'verified' -or $proof.source_sha -cne $ExpectedSourceSha -or $proof.installed_sha -cne $ExpectedSourceSha -or $proof.upstream_enabled -isnot [bool] -or $proof.upstream_enabled){throw 'PRIVATE_RUNTIME_READBACK_UNVERIFIED'}
$proof|ConvertTo-Json -Compress
