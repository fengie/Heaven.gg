# One-run Heaven2 game cache wizard. Safe inspection is the default.
#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Run','Report','Move','Undo','Help')][string]$Mode='Run',
    [switch]$NoPrompt,
    [string]$ManifestPath='',
    [string]$TestFixtureRoot=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Cache-Placement.Common.ps1')

function Write-CacheHelp {
    Write-Output 'Heaven2 Game Cache Tools: run a single PowerShell file; no manual code or JSON required.'
    Write-Output 'The default action inventories shader caches, shows sizes, and offers optional Move/Undo menus.'
    Write-Output 'NVIDIA/Windows managed caches stay on C:; no automatic moves or cache deletions.'
    Write-Output 'Moving a specific game-owned cache requires choosing a folder and explicit local approval.'
}
function Format-CacheSize {
    param([object]$Row)
    if(-not $Row.complete -or $null -eq $Row.bytes) {return 'unknown'}
    $n=[double]$Row.bytes
    if($n -lt 1024) {return ('{0} B' -f [long]$n)}
    if($n -lt 1048576) {return ('{0:N1} KiB' -f ($n/1024))}
    if($n -lt 1073741824) {return ('{0:N1} MiB' -f ($n/1048576))}
    return ('{0:N2} GiB' -f ($n/1073741824))
}
function Invoke-CacheReport {
    $args=@{}
    if($ManifestPath) {$args.ManifestPath=$ManifestPath}
    if($TestFixtureRoot) {$args.TestFixtureRoot=$TestFixtureRoot}
    $raw=(& (Join-Path $PSScriptRoot 'Inspect-HeavenGameCaches.ps1') @args | Out-String).Trim()
    $report= $raw | ConvertFrom-Json -ErrorAction Stop
    if($report.schema -cne 'heaven-toolbox/game-cache-placement/v1' -or
        $report.effects -ne $false) {throw 'UNTRUSTED_INVENTORY_RESULT'}
    Write-Output 'Heaven2 game and shader cache scan (read-only)'
    Write-Output '------------------------------------------------'
    $found=0
    foreach($item in @($report.candidates)) {
        if(-not $item.exists) {continue}
        $found++
        $amount=Format-CacheSize -Row $item
        $label=[string]$item.owner
        $decision=[string]$item.decision
        if($decision -eq 'MANAGED_LEAVE_C') {$meaning='System/driver cache: leave on C:'}
        elseif($decision -eq 'ALREADY_ON_E') {$meaning='Already on E: SSD'}
        elseif($decision -eq 'LIBRARY_MANAGED') {$meaning='Steam manages this library'}
        elseif($decision -eq 'PILOT_REVIEW_REQUIRED') {$meaning='Game cache: optional reviewed move'}
        else {$meaning='Not verified for relocation'}
        Write-Output ('{0} | {1} | {2}' -f $label,$amount,$meaning)
        if(-not $item.complete) {Write-Output '  Size incomplete or inaccessible; do not assume zero.'}
    }
    if($found -eq 0) {Write-Output 'No matching caches were found in the bounded inventory.'}
    Write-Output 'No caches were moved. Windows/NVIDIA caches are NOT automatically relocated.'
    Write-Output 'The C: backup is retained after any optional pilot: moving alone does not reclaim C: space.'
}
function Assert-OperatorConsole {
    if($NoPrompt) {throw 'INTERACTION_REQUIRED'}
    if($TestFixtureRoot) {throw 'INTERACTION_NOT_ALLOWED_IN_FIXTURE'}
    try {
        if([Console]::IsInputRedirected) {throw 'INTERACTION_REQUIRED'}
    }catch [System.InvalidOperationException] {throw 'INTERACTION_REQUIRED'}
}
function Select-CacheFolder {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        $dialog=New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description='Select one disposable game shader/cache folder (NOT saves, mods or game installation)'
        $dialog.SelectedPath=$env:LOCALAPPDATA
        $answer=$dialog.ShowDialog()
        if($answer -ne [System.Windows.Forms.DialogResult]::OK) {return ''}
        return [string]$dialog.SelectedPath
    } catch {
        Write-Output 'Windows folder picker unavailable. No file changes made.'
        return ''
    }
}
function New-SafeCacheName {
    param([string]$Name)
    $safe=($Name -replace '[^A-Za-z0-9_-]','-').Trim('-')
    if($safe.Length -lt 2 -or $safe.Length -gt 64) {throw 'UNSAFE_GAME_CACHE_NAME'}
    return $safe
}
function Invoke-GuidedMove {
    Assert-OperatorConsole
    Write-Output ''
    Write-Output 'This is ONLY for a disposable game-owned cache, NOT saved games, mods or driver caches.'
    Write-Output 'Close the owning game and launcher before continuing.'
    $chosen=Select-CacheFolder
    if(-not $chosen) {Write-Output 'Cancelled: no folder selected.';return}
    $chosen=Get-CacheFullPath $chosen
    if(-not (Test-CacheWithin $chosen $env:LOCALAPPDATA)) {
        throw 'SELECTED_FOLDER_OUTSIDE_USER_GAME_CACHE'
    }
    $prefix=$env:LOCALAPPDATA.TrimEnd('\')+'\'
    $relative=$chosen.Substring($prefix.Length)
    $parts=$relative.Split([char]'\')
    if($parts.Count -lt 2) {throw 'SELECT_NESTED_GAME_CACHE_FOLDER'}
    if($relative -match '(?i)(^|\\)(NVIDIA|Microsoft|Packages|D3DSCache|Temp|CrashDumps|Save|Saves|SavedGames|Mods|userdata|Config|Settings|Profiles)(\\|$)') {
        throw 'MANAGED_OR_DURABLE_GAME_FOLDER_FORBIDDEN'
    }
    $leaf=$parts[$parts.Count-1]
    if($leaf -notmatch '(?i)(cache|shader|pipeline|pso)') {
        throw 'SELECT_EXPLICIT_SHADER_CACHE_DIRECTORY'
    }
    $game=New-SafeCacheName $parts[0]
    $cache=New-SafeCacheName $leaf
    $sourceItem=Get-Item -LiteralPath $chosen -Force -ErrorAction Stop
    if(-not $sourceItem.PSIsContainer) {throw 'CACHE_DIRECTORY_REQUIRED'}
    Assert-CacheAncestors $chosen
    $volume=Get-Volume -DriveLetter E -ErrorAction Stop
    if($volume.FileSystem -ne 'NTFS' -or
        [string]::IsNullOrWhiteSpace([string]$volume.UniqueId)) {throw 'EXTERNAL_SSD_NOT_READY'}
    $target=Join-Path (Join-Path 'E:\GameCaches' $game) $cache
    if(Test-Path -LiteralPath $target) {throw 'CACHE_TARGET_ALREADY_EXISTS'}
    $process=([string](Read-Host 'Owning game executable name from Task Manager (e.g. ExampleGame.exe; blank cancels)')).Trim()
    if(-not $process) {Write-Output 'Cancelled.';return}
    if($process -notmatch '^[A-Za-z0-9_.-]{2,80}(\.exe)?$') {
        throw 'PROCESS_NAME_INVALID'
    }
    $sample=Get-CacheTreeSnapshot -Root $chosen -MaxEntries 10000 -MaxSeconds 45
    if(-not $sample.complete -or [long]$sample.bytes -le 0) {
        throw 'CACHE_SIZE_UNVERIFIED'
    }
    Write-Output ''
    Write-Output ('Source: {0}' -f $chosen)
    Write-Output ('Destination: {0}' -f $target)
    Write-Output ('Cache size: {0}' -f (Format-CacheSize -Row $sample))
    Write-Output ('Game process: {0}' -f $process)
    Write-Output 'The original will remain backed up on C:. New game files on E: will prevent automatic rollback.'
    Write-Output 'No C: space will be reclaimed until a separately reviewed backup-retirement operation.'
    $ok=Read-Host 'Type MOVE to approve this exact game-owned cache (anything else cancels)'
    if($ok -cne 'MOVE') {Write-Output 'Cancelled. No files changed.';return}
    $root=Join-Path $env:LOCALAPPDATA 'HeavenToolbox\cache-placement\wizard-plans'
    Assert-CacheAncestors $root
    if(-not (Test-Path -LiteralPath $root -PathType Container)) {
        New-Item -ItemType Directory -Path $root -ErrorAction Stop | Out-Null
    }
    $id='game-'+[guid]::NewGuid().ToString('N').Substring(0,14)
    $plan=Join-Path $root ($id+'.json')
    $record=[ordered]@{
        schema='heaven-toolbox/game-cache-manifest/v1'
        entries=@([ordered]@{
            id=$id;owner=$game;kind='game-owned';source=$chosen;target=$target
            target_volume_id=[string]$volume.UniqueId;process_names=@($process);approved=$true
        })
    }
    if(Test-Path -LiteralPath $plan) {throw 'WIZARD_PLAN_COLLISION'}
    [IO.File]::WriteAllText($plan,($record|ConvertTo-Json -Depth 6),[Text.Encoding]::UTF8)
    $preview=(& (Join-Path $PSScriptRoot 'Invoke-HeavenGameCachePlacement.ps1') -Mode Preview -ManifestPath $plan -CacheId $id -Confirm:$false | Out-String) | ConvertFrom-Json
    if($preview.status -cne 'PREVIEW_ONLY') {throw 'GAME_MOVE_PREVIEW_REJECTED'}
    $result=(& (Join-Path $PSScriptRoot 'Invoke-HeavenGameCachePlacement.ps1') -Mode Apply -ManifestPath $plan -CacheId $id -Confirm:$false | Out-String) | ConvertFrom-Json
    Write-Output ('Game cache: {0}. Test the game before retiring ANY backup.' -f [string]$result.status)
    Write-Output 'You can use Undo inside this same launcher. It refuses to drop newly written files.'
}
function Invoke-GuidedUndo {
    Assert-OperatorConsole
    $folder=Join-Path $env:LOCALAPPDATA 'HeavenToolbox\cache-placement\wizard-plans'
    $journal=Join-Path $env:LOCALAPPDATA 'HeavenToolbox\cache-placement\transactions'
    Assert-CacheAncestors $folder
    Assert-CacheAncestors $journal
    if(-not (Test-Path -LiteralPath $folder -PathType Container)) {
        Write-Output 'No wizard-managed cache transactions found.';return
    }
    $plans=New-Object 'System.Collections.Generic.List[object]'
    foreach($file in @(Get-ChildItem -LiteralPath $folder -File -Filter 'game-*.json' -ErrorAction Stop | Select-Object -First 50)) {
        try {
            $entry=Read-CachePlacementManifest $file.FullName
            $item=@($entry.entries)[0]
            if(Test-Path -LiteralPath (Join-Path $journal ([string]$item.id+'.json')) -PathType Leaf) {
                $plans.Add([pscustomobject]@{id=[string]$item.id;path=$file.FullName;owner=[string]$item.owner})
            }
        } catch {continue}
    }
    if($plans.Count -eq 0) {Write-Output 'No wizard-managed transaction eligible for review.';return}
    Write-Output 'Select one prior game cache to attempt conservative rollback:'
    for($i=0;$i -lt $plans.Count;$i++) {
        Write-Output ('[{0}] {1} ({2})' -f ($i+1),$plans[$i].owner,$plans[$i].id)
    }
    $answer=Read-Host 'Number (Enter cancels)'
    if([string]::IsNullOrWhiteSpace($answer)) {Write-Output 'Cancelled.';return}
    $index=0
    if(-not [int]::TryParse($answer,[ref]$index) -or $index -lt 1 -or $index -gt $plans.Count) {
        throw 'INVALID_TRANSACTION_SELECTION'
    }
    $pick=$plans[$index-1]
    if((Read-Host 'Type UNDO to restore the unchanged C: backup') -cne 'UNDO') {
        Write-Output 'Cancelled.';return
    }
    $result=(& (Join-Path $PSScriptRoot 'Invoke-HeavenGameCachePlacement.ps1') -Mode Rollback -ManifestPath $pick.path -CacheId $pick.id -Confirm:$false | Out-String) | ConvertFrom-Json
    Write-Output ('Rollback: {0}. E: copy retained; nothing deleted automatically.' -f $result.status)
}
if($Mode -eq 'Help') {Write-CacheHelp;return}
Assert-CacheContext -TestFixtureRoot $TestFixtureRoot
if($Mode -eq 'Move') {Invoke-GuidedMove;return}
if($Mode -eq 'Undo') {Invoke-GuidedUndo;return}
Invoke-CacheReport
if($Mode -eq 'Report' -or $NoPrompt) {return}
Assert-OperatorConsole
Write-Output ''
Write-Output 'One-run menu: [1] Choose game cache to move safely  [2] Undo prior move  [Enter] Finish'
$choice=Read-Host 'Your choice'
switch ($choice) {
    '1' {Invoke-GuidedMove}
    '2' {Invoke-GuidedUndo}
    default {Write-Output 'Scan finished. No additional action required.'}
}
