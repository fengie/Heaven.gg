# Read-only native Heaven1 observation. NOT signed deployment admission, installer, or release authority.
# An authorized Toolbox signer must independently bind this output to the admitted source SHA.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ExpectedCommit,
    [Parameter(Mandatory = $true)][ValidateRange(1,2147483647)][int]$ExpectedPid,
    [Parameter(Mandatory = $false)][ValidateRange(1,65535)][int]$Port = 8787
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
    if ([Environment]::MachineName -ine 'heaven') {
        throw 'Physical machine must be heaven (Heaven1); Heaven2 and hosted runners cannot attest.'
    }
    if ($ExpectedCommit -cnotmatch '^[a-f0-9]{40}$') {
        throw 'ExpectedCommit must be a previously admitted full SHA-1 commit ID.'
    }

    $repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).ProviderPath
    $actual = (& git -C $repo rev-parse --verify HEAD 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $actual -cne $ExpectedCommit) {
        throw 'Checked-out source does not match admitted commit.'
    }
    $script = (Resolve-Path -LiteralPath (Join-Path $repo 'apps\trader\server.mjs')).ProviderPath
    $dirty = (& git -C $repo status --porcelain=v1 --untracked-files=no -- apps/trader data/game/item_names.tsv 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $dirty) {
        throw 'Trader or catalog tracked source is dirty.'
    }

    $proc = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ExpectedPid" -ErrorAction Stop
    if ($null -eq $proc -or [int]$proc.ProcessId -ne $ExpectedPid) {
        throw 'The expected Trader process is not running.'
    }
    if ([string]::IsNullOrWhiteSpace($proc.CommandLine) -or
        $proc.CommandLine.IndexOf($script,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'Process command line does not identify the exact absolute Trader entrypoint.'
    }
    if ($proc.Name -notmatch '^node(\.exe)?$') {
        throw 'Expected PID is not a Node.js process.'
    }
    $owner = Invoke-CimMethod -InputObject $proc -MethodName GetOwner -ErrorAction Stop
    if ([int]$owner.ReturnValue -ne 0 -or [string]::IsNullOrWhiteSpace($owner.User)) {
        throw 'Cannot independently read the running process owner.'
    }
    if ($owner.User -ieq 'SYSTEM') {
        throw 'Trader must not run as NT AUTHORITY\SYSTEM.'
    }

    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    if ($listeners.Count -ne 1 -or
        $listeners[0].LocalAddress -cne '127.0.0.1' -or
        [int]$listeners[0].OwningProcess -ne $ExpectedPid) {
        throw 'Trader must own exactly one loopback-only listener on the expected port.'
    }

    $fileHash=(Get-FileHash -LiteralPath $script -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    $observed=[ordered]@{
        status = 'UNSIGNED_RUNTIME_OBSERVATION_ONLY'
        physicalHost = [Environment]::MachineName
        expectedCommit = $ExpectedCommit
        processId = $ExpectedPid
        processStartedUtc = ([DateTime]$proc.CreationDate).ToUniversalTime().ToString('o')
        processUser = "$($owner.Domain)\$($owner.User)"
        executable = $proc.ExecutablePath
        entrypoint = $script
        entrypointSha256 = $fileHash
        listenerIp = '127.0.0.1'
        listenerPort = $Port
        checkedUtc = [DateTime]::UtcNow.ToString('o')
        limits = 'Not signed. Does not prove release approval, complete installed tree, Cloudflare HTTPS route, credentials, or restart.'
    }
    $observed | ConvertTo-Json -Depth 4
} catch {
    [Console]::Error.WriteLine('TRADER_RUNTIME_HOLD: ' + $_.Exception.Message)
    exit 1
}
