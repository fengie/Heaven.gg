# One explicitly approved game-owned cache. No automatic or global cache moves.
#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param(
    [ValidateSet('Preview','Apply','Verify','Rollback')][string]$Mode='Preview',
    [Parameter(Mandatory)][string]$ManifestPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{1,47}$')][string]$CacheId,
    [string]$JournalRoot='',
    [string]$TestFixtureRoot=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Cache-Placement.Common.ps1')
Assert-CacheContext -TestFixtureRoot $TestFixtureRoot
if(-not $TestFixtureRoot -and $JournalRoot) {throw 'JOURNAL_OVERRIDE_NOT_ALLOWED'}
if(-not $JournalRoot) {
    $JournalRoot=Join-Path $env:LOCALAPPDATA 'HeavenToolbox\cache-placement\transactions'
}
if($TestFixtureRoot -and -not (Test-CacheWithin $JournalRoot $TestFixtureRoot)) {
    throw 'JOURNAL_OUTSIDE_FIXTURE'
}
Assert-CacheAncestors -Path $JournalRoot
$manifest=Read-CachePlacementManifest -ManifestPath $ManifestPath
$match=@($manifest.entries | Where-Object { [string]$_.id -ceq $CacheId })
if($match.Count -ne 1) {throw 'CACHE_ID_NOT_FOUND'}
$entry=$match[0]
$src=Get-CacheFullPath ([string]$entry.source)
$dst=Get-CacheFullPath ([string]$entry.target)
$journalFile=Join-Path $JournalRoot ($CacheId+'.json')
$manifestHash=(Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash
function Save-CacheJournal {
    param([object]$Data)
    $temp=Join-Path $JournalRoot ('.journal-'+[guid]::NewGuid().ToString('N')+'.json')
    $json=$Data | ConvertTo-Json -Depth 7 -Compress
    try {
        Set-Content -LiteralPath $temp -Value $json -Encoding UTF8 -ErrorAction Stop
        if(Test-Path -LiteralPath $journalFile) {
            # .NET Framework File.Replace requires a valid backup path on
            # the actual Windows PowerShell 5.1 runner; never pass null here.
            $oldJournal=$journalFile+'.replace-'+[guid]::NewGuid().ToString('N')
            [IO.File]::Replace($temp,$journalFile,$oldJournal)
            if(Test-Path -LiteralPath $oldJournal -PathType Leaf) {
                Remove-Item -LiteralPath $oldJournal -Force -ErrorAction Stop
            }
        } else {
            [IO.File]::Move($temp,$journalFile)
        }
    } finally {
        if(Test-Path -LiteralPath $temp) {Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}
    }
}
function New-CacheResponse {
    param([string]$Status,[bool]$Effects=$false)
    [pscustomobject]@{schema='heaven-toolbox/game-cache-transaction/v1';
        id=$CacheId;mode=$Mode;status=$Status;effects=$Effects;
        app_verified=$false} | ConvertTo-Json -Depth 4 -Compress
}
function Assert-CacheProcessesStopped {
    if($TestFixtureRoot) {return}
    $names=@($entry.process_names | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if($names.Count -eq 0) {throw 'PROCESS_SCOPE_REQUIRED'}
    foreach($proc in $names) {
        $name=[string]$proc
        if($name -notmatch '^[A-Za-z0-9_.-]{2,80}(\.exe)?$') {throw 'PROCESS_NAME_INVALID'}
        $baseName=$name -replace '(?i)\.exe$',''
        if(@(Get-Process -Name $baseName -ErrorAction SilentlyContinue).Count -gt 0) {
            throw 'CACHE_OWNER_STILL_RUNNING'
        }
    }
}
function Assert-LinkMatches {
    $link=Get-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue
    if($null -eq $link -or [string]$link.LinkType -ne 'Junction' -or
        ($link.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        throw 'JUNCTION_MISSING_OR_REPLACED'
    }
    $linkTarget=[string]$link.Target
    if(-not [string]::Equals((Get-CacheFullPath $linkTarget),$dst,
        [StringComparison]::OrdinalIgnoreCase)) {throw 'JUNCTION_TARGET_CHANGED'}
}
function Get-CompleteSnapshot {
    param([string]$Path)
    $snapshot=Get-CacheTreeSnapshot -Root $Path -HashFiles -MaxEntries 10000 -MaxBytes 42949672960 -MaxSeconds 300
    if(-not $snapshot.complete) {throw 'SNAPSHOT_INCOMPLETE'}
    return $snapshot
}
# Serialize all cache mutations for this Windows user/session. A live
# concurrent transaction cannot share a source directory safely; the OS
# releases this mutex on process death, without stale lock-file cleanup.
$cacheMutex=$null
$cacheMutexHeld=$false
if($Mode -in @('Apply','Rollback')) {
    $cacheMutex=[System.Threading.Mutex]::new($false,'Local\HeavenToolbox.GameCachePlacement.v1')
    try { $cacheMutexHeld=$cacheMutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $cacheMutexHeld=$true }
    if(-not $cacheMutexHeld) {
        $cacheMutex.Dispose()
        throw 'CACHE_TRANSACTION_BUSY'
    }
}
try {
$existingJournal=Test-Path -LiteralPath $journalFile -PathType Leaf
if($Mode -eq 'Apply' -and $existingJournal) {throw 'TRANSACTION_EXISTS'}
Assert-CacheSourceAndTarget -Entry $entry -TestFixtureRoot $TestFixtureRoot -AllowLinkedSource:($Mode -in @('Verify','Rollback'))
if($Mode -eq 'Preview') {
    if($existingJournal) {return New-CacheResponse -Status 'TRANSACTION_EXISTS'}
    if(-not (Test-Path -LiteralPath $src -PathType Container)) {throw 'CACHE_SOURCE_MISSING'}
    if(Test-Path -LiteralPath $dst) {throw 'TARGET_EXISTS'}
    return New-CacheResponse -Status 'PREVIEW_ONLY'
}
if($Mode -eq 'Apply') {
    if($entry.approved -isnot [bool] -or $entry.approved -ne $true) {
        throw 'NOT_APPROVED'
    }
    Assert-CacheProcessesStopped
    if(-not (Test-Path -LiteralPath $src -PathType Container)) {throw 'CACHE_SOURCE_MISSING'}
    if(Test-Path -LiteralPath $dst) {throw 'TARGET_EXISTS'}
    if(-not $PSCmdlet.ShouldProcess($src,'Copy verified cache to external SSD, keep original backup, create junction')) {
        return New-CacheResponse -Status 'WHATIF_NO_CHANGES'
    }
    $before=Get-CompleteSnapshot $src
    if($before.bytes -le 0) {throw 'EMPTY_CACHE_NOT_WORTH_MOVING'}
    if(-not $TestFixtureRoot) {
        $free=(Get-Volume -DriveLetter E -ErrorAction Stop).SizeRemaining
        if($free -lt ($before.bytes + 1073741824)) {throw 'TARGET_INSUFFICIENT_SPACE'}
    }
    $parent=Split-Path -Parent $dst
    Assert-CacheAncestors -Path $parent
    if(-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force -ErrorAction Stop | Out-Null
    }
    if(-not (Test-Path -LiteralPath $JournalRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $JournalRoot -Force -ErrorAction Stop | Out-Null
    }
    $tx=[guid]::NewGuid().ToString('N')
    $stage=$dst+'.heaven-stage-'+$tx
    $backup=$src+'.heaven-backup-'+$tx
    if((Test-Path -LiteralPath $backup) -or (Test-Path -LiteralPath $stage) -or
        (Test-Path -LiteralPath $dst) -or (Test-Path -LiteralPath $journalFile)) {
        throw 'TRANSACTION_PATH_COLLISION'
    }
    $state=[ordered]@{
        schema='heaven-toolbox/game-cache-transaction/v1';id=$CacheId;
        tx=$tx;source=$src;target=$dst;stage=$stage;backup=$backup;
        manifest_sha256=$manifestHash;volume_id=[string]$entry.target_volume_id;
        process_names=@($entry.process_names | ForEach-Object { [string]$_ });
        copied_sha256=$before.digest;copied_bytes=[long]$before.bytes;
        phase='PREPARED';created_utc=[DateTimeOffset]::UtcNow.ToString('o')
    }
    Save-CacheJournal $state
    try {
        New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
        # Never copy junction targets, delete source, mirror, purge or overwrite.
        & robocopy.exe $src $stage /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
        $copyExit=$LASTEXITCODE
        # Robocopy exit 1..7 is a documented successful/mixed copy result.
        # Never leave a nonzero native exit code behind on a successful
        # PowerShell script: GitHub Actions' shell wrapper checks LASTEXITCODE.
        if($copyExit -ge 8) {throw 'ROBOCOPY_FAILED'}
        $global:LASTEXITCODE=0
        $after=Get-CompleteSnapshot $stage
        $stable=Get-CompleteSnapshot $src
        if($after.digest -cne $before.digest -or $stable.digest -cne $before.digest -or
            $after.bytes -ne $before.bytes) {throw 'COPY_VERIFICATION_FAILED'}
        $state.phase='COPIED'
        Save-CacheJournal $state
        Assert-CacheProcessesStopped
        Rename-Item -LiteralPath $stage -NewName (Split-Path -Leaf $dst) -ErrorAction Stop
        $state.phase='TARGET_PUBLISHED'
        Save-CacheJournal $state
        $final=Get-CompleteSnapshot $dst
        if($final.digest -cne $before.digest) {throw 'TARGET_CHANGED_BEFORE_LINK'}
        $again=Get-CompleteSnapshot $src
        if($again.digest -cne $before.digest) {throw 'SOURCE_CHANGED_BEFORE_LINK'}
        # Renaming the source in place leaves a recoverable original backup.
        Rename-Item -LiteralPath $src -NewName (Split-Path -Leaf $backup) -ErrorAction Stop
        $state.phase='BACKUP_RENAMED'
        Save-CacheJournal $state
        New-Item -ItemType Junction -Path $src -Target $dst -ErrorAction Stop | Out-Null
        Assert-LinkMatches
        $state.phase='LINKED'
        Save-CacheJournal $state
        return New-CacheResponse -Status 'AWAITING_APP_ACCEPTANCE' -Effects $true
    } catch {
        # Never silently delete or restore unknown game writes. The journal
        # preserves all known locations for an explicit Verify/Rollback.
        throw
    }
}
if(-not $existingJournal) {throw 'TRANSACTION_JOURNAL_MISSING'}
# A journal grants authority to remove a junction and restore a directory.
# Reject a linked/oversized/foreign journal before trusting ANY saved path.
$journalInfo=Get-Item -LiteralPath $journalFile -Force -ErrorAction Stop
if($journalInfo.PSIsContainer -or
    ($journalInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
    $journalInfo.Length -gt 16384) {throw 'TRANSACTION_JOURNAL_MISMATCH'}
$state=Get-Content -LiteralPath $journalFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
$txId=[string]$state.tx
if($txId -cnotmatch '^[a-f0-9]{32}$') {throw 'TRANSACTION_JOURNAL_MISMATCH'}
$expectedBackup=$src+'.heaven-backup-'+$txId
$expectedStage=$dst+'.heaven-stage-'+$txId
if($state.schema -cne 'heaven-toolbox/game-cache-transaction/v1' -or
    [string]$state.id -cne $CacheId -or
    [string]$state.source -cne $src -or [string]$state.target -cne $dst -or
    [string]$state.backup -cne $expectedBackup -or
    [string]$state.stage -cne $expectedStage -or
    [string]$state.volume_id -cne [string]$entry.target_volume_id -or
    [string]$state.copied_sha256 -cnotmatch '^[a-f0-9]{64}$' -or
    [long]$state.copied_bytes -le 0 -or
    [string]$state.manifest_sha256 -cnotmatch '^[A-Fa-f0-9]{64}$' -or
    [string]$state.phase -cnotin @('PREPARED','COPIED','TARGET_PUBLISHED','BACKUP_RENAMED','LINKED','ROLLED_BACK')) {
    throw 'TRANSACTION_JOURNAL_MISMATCH'
}
# Recovery binds identity to source/target/volume and transaction GUID, NOT
# the whole mutable manifest: revoking Apply approval must not strand a cache.
Assert-CacheAncestors -Path $expectedBackup
Assert-CacheAncestors -Path $expectedStage
if($Mode -eq 'Verify') {
    if([string]$state.phase -cne 'LINKED') {throw 'TRANSACTION_NOT_LINKED'}
    Assert-LinkMatches
    if(-not (Test-Path -LiteralPath $dst -PathType Container)) {throw 'TARGET_UNAVAILABLE'}
    if(-not (Test-Path -LiteralPath ([string]$state.backup) -PathType Container)) {
        throw 'BACKUP_UNAVAILABLE'
    }
    return New-CacheResponse -Status 'LINK_HEALTHY_APP_UNVERIFIED'
}
if($Mode -eq 'Rollback') {
    # A later edit of the manifest must not weaken the app-shutdown evidence
    # recorded when this particular directory was first approved and linked.
    $storedProcesses=@($state.process_names | ForEach-Object { [string]$_ })
    $currentProcesses=@($entry.process_names | ForEach-Object { [string]$_ })
    if($storedProcesses.Count -lt 1 -or $storedProcesses.Count -gt 16) {
        throw 'TRANSACTION_JOURNAL_MISMATCH'
    }
    $storedNorm=@($storedProcesses | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    $currentNorm=@($currentProcesses | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    if(-not [string]::Equals(([string]::Join('|',$storedNorm)),
        ([string]::Join('|',$currentNorm)),[StringComparison]::Ordinal)) {
        throw 'PROCESS_SCOPE_CHANGED'
    }
    if([string]$state.phase -ceq 'ROLLED_BACK') {
        # Terminal journal state is not proof of actual filesystem state:
        # a forged/stale receipt must never mask an active junction.
        $current=Get-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue
        if($null -eq $current -or -not $current.PSIsContainer -or
            ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
            (Test-Path -LiteralPath ([string]$state.backup))) {
            throw 'ROLLBACK_STATE_CONFLICT'
        }
        return New-CacheResponse -Status 'ROLLED_BACK'
    }
    Assert-CacheProcessesStopped
    if(-not (Test-Path -LiteralPath ([string]$state.backup) -PathType Container)) {
        # A failed pre-cutover copy still has the original. Do not clean
        # arbitrary staging artifacts or rename anything.
        if(Test-Path -LiteralPath $src -PathType Container) {
            throw 'PRE_CUTOVER_ORIGINAL_INTACT_HOLD'
        }
        throw 'BACKUP_UNAVAILABLE'
    }
    # Never replace a working junction with a changed/corrupt retained C:
    # original. The backup and E: payload must independently match the
    # exact copied source snapshot before any filesystem retirement.
    $originalNow=Get-CompleteSnapshot ([string]$state.backup)
    if($originalNow.digest -cne [string]$state.copied_sha256 -or
        $originalNow.bytes -ne [long]$state.copied_bytes) {
        throw 'BACKUP_CHANGED_HOLD'
    }
    if(Test-Path -LiteralPath $dst -PathType Container) {
        $now=Get-CompleteSnapshot $dst
        if($now.digest -cne [string]$state.copied_sha256) {
            throw 'NEW_DATA_HOLD'
        }
    }
    $link=Get-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue
    if($null -ne $link) { Assert-LinkMatches }
    if(-not $PSCmdlet.ShouldProcess($src,'Remove verified junction only and restore original backup')) {
        return New-CacheResponse -Status 'ROLLBACK_NOT_RUN'
    }
    if($null -ne $link) {
        # Non-recursive NTFS link-entry deletion. Never traverse the target.
        [IO.Directory]::Delete($src,$false)
    }
    if(Test-Path -LiteralPath $src) {throw 'SOURCE_PATH_RECREATED_HOLD'}
    Rename-Item -LiteralPath ([string]$state.backup) -NewName (Split-Path -Leaf $src) -ErrorAction Stop
    $state.phase='ROLLED_BACK'
    Save-CacheJournal $state
    return New-CacheResponse -Status 'ROLLED_BACK' -Effects $true
}
throw 'INVALID_MODE'
} finally {
    if($cacheMutexHeld) {
        try { $cacheMutex.ReleaseMutex() } catch {}
    }
    if($null -ne $cacheMutex) { $cacheMutex.Dispose() }
}
