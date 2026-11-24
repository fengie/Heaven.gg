param([string]$PolicyPath = '.heaven/update-policy.json')

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PolicyPath -PathType Leaf)) { throw "Missing required $PolicyPath" }
$p = Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
if ([string]$p.schema -ne 'heaven-toolbox/update-policy/v1') { throw 'Unsupported update-policy schema.' }
if ([string]$p.repository -ne [string]$env:EXPECTED_REPOSITORY) { throw "Policy repository mismatch: $($p.repository) != $env:EXPECTED_REPOSITORY" }
if ([string]$p.branch -ne 'main') { throw 'Automatic update policy must target main.' }
$kind = ([string]$p.kind).Trim()
if ($kind -notin @('source','product','release-channel','mirror')) { throw "Unsupported repository kind: $kind" }
if ($p.source_update.required -isnot [bool] -or -not $p.source_update.required) { throw 'Automatic main source consumption must be required.' }
if ([string]$p.source_update.strategy -ne 'ff-only') { throw 'Source update strategy must be ff-only.' }
$interval = $p.source_update.poll_interval_minutes
if ($interval -isnot [int] -and $interval -isnot [long]) { throw 'Source update poll interval must be an integer.' }
if ($interval -lt 1 -or $interval -gt 60) { throw 'Source update poll interval must be 1-60 minutes.' }
$mode = ([string]$p.runtime_update.mode).Trim()
if ($mode -notin @('none','apply-script','self-update-release','release-channel')) { throw "Unsupported runtime update mode: $mode" }
if ($kind -eq 'product' -and $mode -eq 'none') { throw 'Runnable product repositories may not disable automatic runtime updating.' }
if ($kind -eq 'release-channel' -and $mode -ne 'release-channel') { throw 'Release-channel repositories must declare runtime_update.mode=release-channel.' }
function Assert-RepoRelativeFile([string]$relative) {
  if ([string]::IsNullOrWhiteSpace($relative)) { throw 'Update evidence path may not be empty.' }
  if ([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)') { throw "Update evidence path escapes repository: $relative" }
  if (-not (Test-Path -LiteralPath $relative -PathType Leaf)) { throw "Required update evidence is missing: $relative" }
}
# This product's private deployment is a paired H1 apply/readback contract.
# Do not accept an apply-only or source-only substitute: the parent updater
# must never promote a hosted runtime without its independent verifier.
if ($p.kind -isnot [string] -or $p.kind -cne 'product' -or
    $p.runtime_update.mode -isnot [string] -or $p.runtime_update.mode -cne 'apply-script' -or
    $p.runtime_update.target_host -isnot [string] -or $p.runtime_update.target_host -cne 'HEAVEN' -or
    $p.runtime_update.apply_script -isnot [string] -or $p.runtime_update.apply_script -cne 'scripts/Apply-HeavenGg.ps1' -or
    $p.runtime_update.verify_script -isnot [string] -or $p.runtime_update.verify_script -cne 'scripts/Test-HeavenGgRuntime.ps1') {
  throw 'H1_RUNTIME_CONTRACT_INVALID'
}
Assert-RepoRelativeFile $p.runtime_update.verify_script
if ($mode -eq 'apply-script') { Assert-RepoRelativeFile ([string]$p.runtime_update.apply_script) }
if ($mode -in @('self-update-release','release-channel')) {
  $evidence = @($p.runtime_update.evidence_paths)
  if ($evidence.Count -eq 0) { throw "Runtime mode $mode requires evidence_paths." }
  foreach ($e in $evidence) { Assert-RepoRelativeFile ([string]$e) }
}
'HEAVEN_AUTOUPDATE_POLICY_OK'
