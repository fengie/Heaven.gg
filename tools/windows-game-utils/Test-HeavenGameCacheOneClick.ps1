# PowerShell 5.1 fixture test for the one-run operator experience.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$launcher=Join-Path $PSScriptRoot 'Start-HeavenGameCacheTools.ps1'
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('heaven-cache-fixture-'+[guid]::NewGuid().ToString('N'))
$prior=$env:HEAVEN_CACHE_FIXTURE_TEST
$env:HEAVEN_CACHE_FIXTURE_TEST='1'
function Assert-Contains {
    param([string]$Body,[string]$Needle)
    if(-not $Body.Contains($Needle)) {throw ('EXPECTED_OPERATOR_TEXT_MISSING: '+$Needle)}
}
function Assert-Reject {
    param([scriptblock]$Call,[string]$ErrorCode)
    $rejected=$false
    try {& $Call | Out-Null} catch {
        if(-not $_.Exception.Message.Contains($ErrorCode)) {throw}
        $rejected=$true
    }
    if(-not $rejected) {throw ('EXPECTED_LAUNCHER_REJECTION: '+$ErrorCode)}
}
try {
    New-Item -ItemType Directory -Path $fixture -Force | Out-Null
    $src=Join-Path $fixture 'source\sample-cache'
    $dst=Join-Path $fixture 'target\sample-cache'
    New-Item -ItemType Directory -Path $src -Force | Out-Null
    $bytes=[byte[]](0,10,20,30,40,50)
    [IO.File]::WriteAllBytes((Join-Path $src 'shader.bin'),$bytes)
    $manifest=Join-Path $fixture 'test-manifest.json'
    [pscustomobject]@{
        schema='heaven-toolbox/game-cache-manifest/v1'
        entries=@([pscustomobject]@{
            id='fixture-cache'
            owner='Example Game'
            kind='game-owned'
            source=$src
            target=$dst
            approved=$false
            target_volume_id='fixture'
            process_names=@('ExampleGame.exe')
        })
    } | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $manifest -Encoding UTF8
    if(-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {throw 'ONE_CLICK_ENTRYPOINT_MISSING'}
    $tokens=$null;$parse=$null
    [void][Management.Automation.Language.Parser]::ParseFile($launcher,[ref]$tokens,[ref]$parse)
    if(@($parse | Where-Object {$null -ne $_}).Count) {throw 'ONE_CLICK_POWERSHELL_PARSE_FAILED'}
    $report=(& $launcher -Mode Report -NoPrompt -TestFixtureRoot $fixture -ManifestPath $manifest | Out-String)
    Assert-Contains $report 'Example Game'
    Assert-Contains $report '6 B'
    Assert-Contains $report 'No caches were moved'
    if(Test-Path -LiteralPath $dst) {throw 'REPORT_ALTERED_CACHE'}
    $auto=(& $launcher -Mode Run -NoPrompt -TestFixtureRoot $fixture -ManifestPath $manifest | Out-String)
    Assert-Contains $auto 'Example Game'
    Assert-Contains $auto 'No caches were moved'
    if(Test-Path -LiteralPath $dst) {throw 'RUN_NO_PROMPT_ALTERED_CACHE'}
    $help=(& $launcher -Mode Help -NoPrompt -TestFixtureRoot $fixture | Out-String)
    Assert-Contains $help 'run a single PowerShell file'
    Assert-Reject {& $launcher -Mode Move -NoPrompt -TestFixtureRoot $fixture -ManifestPath $manifest} 'INTERACTION_REQUIRED'
    Assert-Reject {& $launcher -Mode Undo -NoPrompt -TestFixtureRoot $fixture -ManifestPath $manifest} 'INTERACTION_REQUIRED'
    if(-not (Test-Path -LiteralPath (Join-Path $src 'shader.bin'))) {throw 'SOURCE_CACHE_LOST'}
    if((Test-Path -LiteralPath (Join-Path $fixture 'wizard-plans')) -or
        (Test-Path -LiteralPath $dst)) {throw 'NO_PROMPT_CREATED_MUTATION'}
    Write-Output 'HEAVEN_CACHE_ONE_CLICK_WINDOWS_FIXTURES_OK'
} finally {
    $env:HEAVEN_CACHE_FIXTURE_TEST=$prior
    if(Test-Path -LiteralPath $fixture) {
        Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction Stop
    }
}
