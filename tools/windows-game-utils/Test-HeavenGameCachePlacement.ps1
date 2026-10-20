# Windows PowerShell 5.1 / NTFS integration tests in owned disposable directories.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$inspect = Join-Path $PSScriptRoot 'Inspect-HeavenGameCaches.ps1'
$move = Join-Path $PSScriptRoot 'Invoke-HeavenGameCachePlacement.ps1'
$common = Join-Path $PSScriptRoot 'Cache-Placement.Common.ps1'
foreach ($file in @($inspect,$move,$common)) {
    $tokens=$null;$errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
    if (@($errors | Where-Object { $null -ne $_ }).Count) {
        throw "CACHE_SCRIPT_PARSE_FAILURE: $file"
    }
}
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('heaven-cache-fixture-'+[guid]::NewGuid().ToString('N'))
$priorFixture=$env:HEAVEN_CACHE_FIXTURE_TEST
$env:HEAVEN_CACHE_FIXTURE_TEST='1'
function Write-Manifest {
    param([string]$Path,[string]$Source,[string]$Target,[bool]$Approved=$true,[string]$Id='fixture-cache',[string]$ProcessName='FixtureGame.exe')
    [ordered]@{schema='heaven-toolbox/game-cache-manifest/v1';entries=@(
        [ordered]@{id=$Id;owner='fixture-game';kind='game-owned';source=$Source;
            target=$Target;approved=$Approved;target_volume_id='fixture';process_names=@($ProcessName)}
    )} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Path -Encoding UTF8
}
function Expect-Reject {
    param([scriptblock]$Invoke,[string]$Code)
    $matched=$false
    try { & $Invoke | Out-Null } catch {
        $matched=([string]$_.Exception.Message).Contains($Code)
        if (-not $matched) {throw "UNEXPECTED_ERROR_FOR_$($Code): $($_.Exception.Message)"}
    }
    if (-not $matched) {throw "EXPECTED_REJECTION_MISSING: $Code"}
}
try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    $srcParent=Join-Path $fixtureRoot 'source'
    $dstParent=Join-Path $fixtureRoot 'target'
    $journal=Join-Path $fixtureRoot 'state'
    New-Item -ItemType Directory -Path $srcParent,$dstParent,$journal -Force | Out-Null
    $src=Join-Path $srcParent 'cache'
    $dst=Join-Path $dstParent 'cache'
    $manifest=Join-Path $fixtureRoot 'cache-manifest.json'
    New-Item -ItemType Directory -Path $src | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $src 'shader.bin'),[byte[]](0,1,2,3,254,255))
    New-Item -ItemType Directory -Path (Join-Path $src 'nested') | Out-Null
    Set-Content -LiteralPath (Join-Path $src 'nested\data.txt') -Value 'test-cache' -Encoding Ascii
    New-Item -ItemType Directory -Path (Join-Path $src 'nested\empty-original') | Out-Null
    Write-Manifest -Path $manifest -Source $src -Target $dst
    $report=(& $inspect -ManifestPath $manifest -TestFixtureRoot $fixtureRoot | Out-String) | ConvertFrom-Json
    if ($report.schema -ne 'heaven-toolbox/game-cache-placement/v1' -or
        $report.effects -ne $false -or $report.candidates.Count -ne 1 -or
        $report.candidates[0].bytes -le 6 -or $report.candidates[0].complete -ne $true) {
        throw 'INVENTORY_PROOF_FAILED'
    }
    if ((Test-Path -LiteralPath $dst) -or (Test-Path -LiteralPath (Join-Path $journal 'fixture-cache.json'))) {
        throw 'INVENTORY_MUTATED_DISK'
    }
    $short=(& $inspect -ManifestPath $manifest -TestFixtureRoot $fixtureRoot -MaxEntries 1 | Out-String) | ConvertFrom-Json
    if ($short.candidates[0].complete -ne $false -or $null -ne $short.candidates[0].bytes) {
        throw 'TRUNCATED_SIZE_FALSE_CONFIDENCE'
    }
    $preview=(& $move -Mode Preview -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false | Out-String) | ConvertFrom-Json
    if ($preview.effects -ne $false -or (Test-Path -LiteralPath $dst)) {throw 'PREVIEW_WROTE_FILES'}
    $whatif=(& $move -Mode Apply -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -WhatIf | Out-String) | ConvertFrom-Json
    if ($whatif.effects -ne $false -or (Test-Path -LiteralPath $dst)) {throw 'WHATIF_WROTE_FILES'}
    # Different PowerShell processes must not execute Apply/Rollback together.
    # Start-Job is an owned, bounded Windows fixture child, never a live agent.
    $lockName='Local\HeavenToolbox.GameCachePlacement.v1'
    $ready=Join-Path $fixtureRoot 'mutex-ready.flag'
    $holder=Start-Job -ScriptBlock {
        param($ReadyPath,$LockName)
        $mutex=New-Object System.Threading.Mutex($false,$LockName)
        $held=$false
        try {
            try {$held=$mutex.WaitOne(0)} catch [System.Threading.AbandonedMutexException] {$held=$true}
            if(-not $held) { [IO.File]::WriteAllText($ReadyPath,'BUSY'); return }
            [IO.File]::WriteAllText($ReadyPath,'HELD')
            Start-Sleep -Seconds 15
        } finally {
            if($held) {$mutex.ReleaseMutex()}
            $mutex.Dispose()
        }
    } -ArgumentList $ready,$lockName
    try {
        for($i=0;$i -lt 100 -and -not (Test-Path -LiteralPath $ready);$i++) {
            Start-Sleep -Milliseconds 50
        }
        if(-not (Test-Path -LiteralPath $ready) -or
            (Get-Content -LiteralPath $ready -Raw).Trim() -ne 'HELD') {
            throw 'MUTEX_FIXTURE_DID_NOT_START'
        }
        Expect-Reject { & $move -Mode Apply -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'CACHE_TRANSACTION_BUSY'
        if((Test-Path -LiteralPath $dst) -or (Test-Path -LiteralPath (Join-Path $journal 'fixture-cache.json'))) {
            throw 'PARALLEL_APPLY_CHANGED_FILES'
        }
    } finally {
        if($null -ne $holder) {
            Stop-Job -Job $holder -ErrorAction SilentlyContinue
            Remove-Job -Job $holder -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Manifest -Path $manifest -Source $src -Target $dst -Approved:$false
    Expect-Reject { & $move -Mode Apply -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'NOT_APPROVED'
    Write-Manifest -Path $manifest -Source $src -Target $dst
    $applied=(& $move -Mode Apply -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false | Out-String) | ConvertFrom-Json
    if (-not $applied.effects -or $applied.status -ne 'AWAITING_APP_ACCEPTANCE') {throw 'APPLY_RESULT_FAILED'}
    if ($LASTEXITCODE -ne 0) {throw 'ROBOCOPY_SUCCESS_EXIT_LEAKED_TO_CALLER'}
    $link=Get-Item -LiteralPath $src -Force
    if ($link.LinkType -ne 'Junction' -or -not (Test-Path -LiteralPath (Join-Path $dst 'nested\data.txt'))) {
        throw 'JUNCTION_OR_DATA_INVALID'
    }
    Expect-Reject { & $move -Mode Apply -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'TRANSACTION_EXISTS'
    # The transaction journal is a filesystem-mutation authority: a poisoned
    # backup path must not move an unrelated owned directory into the source.
    $journalFile=Join-Path $journal 'fixture-cache.json'
    $originalJournal=Get-Content -LiteralPath $journalFile -Raw
    $foreign=Join-Path $fixtureRoot 'foreign-backup-canary'
    New-Item -ItemType Directory -Path $foreign | Out-Null
    Set-Content -LiteralPath (Join-Path $foreign 'keep.txt') 'PRESERVE' -Encoding Ascii
    $forged=$originalJournal | ConvertFrom-Json
    $forged.backup=$foreign
    $forged | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $journalFile -Encoding UTF8
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'TRANSACTION_JOURNAL_MISMATCH'
    if (-not (Test-Path -LiteralPath (Join-Path $foreign 'keep.txt')) -or
        (Get-Item -LiteralPath $src -Force).LinkType -ne 'Junction') {
        throw 'TAMPERED_JOURNAL_MOVED_FOREIGN_DATA'
    }
    Set-Content -LiteralPath $journalFile -Value $originalJournal -Encoding UTF8
    # Revoking prior Apply approval is not allowed to strand an existing
    # linked directory: Verify and Rollback must use bound path/tx identity.
    Write-Manifest -Path $manifest -Source $src -Target $dst -Approved:$false
    # A forged terminal phase cannot hide an active junction.
    $phaseForged=$originalJournal | ConvertFrom-Json
    $phaseForged.phase='ROLLED_BACK'
    $phaseForged | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $journalFile -Encoding UTF8
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'ROLLBACK_STATE_CONFLICT'
    if ((Get-Item -LiteralPath $src -Force).LinkType -ne 'Junction') {
        throw 'FALSE_TERMINAL_PHASE_UNLINKED_ACTIVE_CACHE'
    }
    Set-Content -LiteralPath $journalFile -Value $originalJournal -Encoding UTF8
    $verify=(& $move -Mode Verify -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal | Out-String) | ConvertFrom-Json
    if ($verify.status -ne 'LINK_HEALTHY_APP_UNVERIFIED') {throw 'VERIFY_RESULT_INVALID'}
    # A mutable manifest may revoke approval without stranding recovery,
    # but it must not silently substitute a different set of owning processes.
    Write-Manifest -Path $manifest -Source $src -Target $dst -Approved:$false -ProcessName 'WrongGame.exe'
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'PROCESS_SCOPE_CHANGED'
    if ((Get-Item -LiteralPath $src -Force).LinkType -ne 'Junction') {
        throw 'MUTABLE_PROCESS_SCOPE_REMOVED_LIVE_LINK'
    }
    Write-Manifest -Path $manifest -Source $src -Target $dst -Approved:$false
    # The retained C: backup is the only recoverable original; restoring
    # a modified/corrupt backup is not a successful rollback.
    $sourceBackupPath=[string](($originalJournal | ConvertFrom-Json).backup)
    $backupFile=Join-Path $sourceBackupPath 'shader.bin'
    $savedBackup=[IO.File]::ReadAllBytes($backupFile)
    [IO.File]::WriteAllBytes($backupFile,[byte[]](12,13,14,15))
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'BACKUP_CHANGED_HOLD'
    if ((Get-Item -LiteralPath $src -Force).LinkType -ne 'Junction' -or
        -not (Test-Path -LiteralPath (Join-Path $dst 'shader.bin'))) {
        throw 'CORRUPTED_BACKUP_WAS_RESTORED'
    }
    [IO.File]::WriteAllBytes($backupFile,$savedBackup)
    Set-Content -LiteralPath (Join-Path $dst 'nested\after-launch.txt') -Value 'NEW-WRITE' -Encoding Ascii
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'NEW_DATA_HOLD'
    if (-not (Test-Path -LiteralPath (Join-Path $src 'nested\after-launch.txt'))) {throw 'NEW_WRITES_WERE_LOST'}
    Remove-Item -LiteralPath (Join-Path $dst 'nested\after-launch.txt') -Force
    # Empty directories are data too: a new or removed directory must HOLD
    # rollback rather than silently omit it from the content snapshot.
    $newEmpty=Join-Path $dst 'nested\new-empty'
    New-Item -ItemType Directory -Path $newEmpty | Out-Null
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'NEW_DATA_HOLD'
    [IO.Directory]::Delete($newEmpty,$false)
    $originalEmpty=Join-Path $dst 'nested\empty-original'
    [IO.Directory]::Delete($originalEmpty,$false)
    Expect-Reject { & $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false } 'NEW_DATA_HOLD'
    New-Item -ItemType Directory -Path $originalEmpty | Out-Null
    $rollback=(& $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false | Out-String) | ConvertFrom-Json
    if ($rollback.status -ne 'ROLLED_BACK' -or
        (Get-Item -LiteralPath $src -Force).LinkType -eq 'Junction' -or
        -not (Test-Path -LiteralPath (Join-Path $src 'shader.bin')) -or
        -not (Test-Path -LiteralPath (Join-Path $dst 'shader.bin'))) {
        throw 'ROLLBACK_DID_NOT_PRESERVE_BOTH_COPIES'
    }
    $again=(& $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false | Out-String) | ConvertFrom-Json
    if ($again.status -ne 'ROLLED_BACK' -or $again.effects -ne $false -or
        (Get-Content -LiteralPath (Join-Path $foreign 'keep.txt')) -ne 'PRESERVE') {
        throw 'REPEAT_ROLLBACK_WAS_NOT_IDEMPOTENT'
    }
    # Crash boundary: a source renamed to the retained backup while the
    # replacement junction is absent must be reversible without deleting E:.
    $crashSrc=Join-Path $srcParent 'crash-cache'
    $crashDst=Join-Path $dstParent 'crash-cache'
    New-Item -ItemType Directory -Path $crashSrc | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $crashSrc 'shader.bin'),[byte[]](17,18,19,20))
    Write-Manifest -Path $manifest -Source $crashSrc -Target $crashDst -Id 'fixture-crash'
    $crashApply=(& $move -Mode Apply -ManifestPath $manifest -CacheId fixture-crash -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false | Out-String) | ConvertFrom-Json
    if ($crashApply.status -ne 'AWAITING_APP_ACCEPTANCE') {throw 'CRASH_FIXTURE_SETUP_FAILED'}
    [IO.Directory]::Delete($crashSrc,$false)
    $crashJournal=Join-Path $journal 'fixture-crash.json'
    $crashState=Get-Content -LiteralPath $crashJournal -Raw | ConvertFrom-Json
    $crashState.phase='BACKUP_RENAMED'
    $crashState | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $crashJournal -Encoding UTF8
    $crashRollback=(& $move -Mode Rollback -ManifestPath $manifest -CacheId fixture-crash -TestFixtureRoot $fixtureRoot -JournalRoot $journal -Confirm:$false | Out-String) | ConvertFrom-Json
    if ($crashRollback.status -ne 'ROLLED_BACK' -or
        -not (Test-Path -LiteralPath (Join-Path $crashSrc 'shader.bin')) -or
        -not (Test-Path -LiteralPath (Join-Path $crashDst 'shader.bin'))) {
        throw 'CRASH_BETWEEN_BACKUP_AND_LINK_NOT_RECOVERABLE'
    }
    $outside=Join-Path $fixtureRoot 'outside'
    New-Item -ItemType Directory -Path $outside | Out-Null
    Set-Content -LiteralPath (Join-Path $outside 'do-not-touch.txt') 'KEEP'
    $badSource=Join-Path $srcParent 'linked'
    New-Item -ItemType Junction -Path $badSource -Target $outside | Out-Null
    Write-Manifest -Path $manifest -Source $badSource -Target (Join-Path $dstParent 'linked')
    Expect-Reject { & $move -Mode Apply -ManifestPath $manifest -CacheId fixture-cache -TestFixtureRoot $fixtureRoot -JournalRoot (Join-Path $fixtureRoot 'journal2') -Confirm:$false } 'REPARSE_UNSAFE'
    if ((Get-Content -LiteralPath (Join-Path $outside 'do-not-touch.txt')) -ne 'KEEP') {throw 'FOREIGN_TARGET_CHANGED'}
    Write-Output 'HEAVEN_CACHE_PLACEMENT_WINDOWS_FIXTURES_OK'
} finally {
    $env:HEAVEN_CACHE_FIXTURE_TEST=$priorFixture
    if (Test-Path -LiteralPath $fixtureRoot) {
        # Abort-time cleanup may run while the cache junction still exists.
        # Delete identified links themselves, not their destination contents.
        foreach ($bad in @((Join-Path $fixtureRoot 'source\linked'),(Join-Path $fixtureRoot 'source\cache'),(Join-Path $fixtureRoot 'source\crash-cache'))) {
            $entry=Get-Item -LiteralPath $bad -Force -ErrorAction SilentlyContinue
            if ($entry -and $entry.LinkType -eq 'Junction') {
                [IO.Directory]::Delete($bad,$false)
            }
        }
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction Stop
    }
}
