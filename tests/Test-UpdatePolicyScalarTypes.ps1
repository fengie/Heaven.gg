$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot '../.github/scripts/Test-UpdatePolicy.ps1'
$source = Get-Content (Join-Path $PSScriptRoot '../.heaven/update-policy.json') -Raw
$temp = [IO.Path]::GetTempFileName()
try {
    foreach ($field in 'required', 'poll_interval_minutes') {
        if ($field -eq 'required') {
            $invalid = @('false','null','"true"','"false"','1','{}','[]','[true]')
            $valid = @('true')
            $expected = 'Automatic main source consumption must be required.'
        } else {
            $invalid = @('false','null','"1"','0','61','1.5','{}','[]')
            $valid = @('1','60')
            $expected = 'Source update poll interval'
        }
        foreach ($literal in (@('missing') + $invalid + $valid)) {
            $policy = $source | ConvertFrom-Json
            if ($literal -eq 'missing') {
                $policy.source_update.PSObject.Properties.Remove($field)
            } else {
                $value = ('{"value":' + $literal + '}') | ConvertFrom-Json
                $policy.source_update.$field = $value.value
            }
            $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temp -Encoding UTF8
            $failure = $null
            try { & $validator -PolicyPath $temp | Out-Null } catch { $failure = $_.Exception.Message }
            if ($literal -in $valid) {
                if ($failure) { throw "$field=$literal should pass. $failure" }
            } elseif (-not $failure -or -not $failure.StartsWith($expected)) {
                throw "$field=$literal should fail the scalar check. Observed '$failure'"
            }
        }
    }

    # A declared hosted service is not valid without its independently callable
    # H1 verifier. The generic apply-script check alone accepted these cases.
    $invalidRuntimeCases = @(
        @{field='target_host';literal='missing'},
        @{field='target_host';literal='null'},
        @{field='target_host';literal='"HEAVEN2"'},
        @{field='target_host';literal='"heaven"'},
        @{field='target_host';literal='["HEAVEN"]'},
        @{field='verify_script';literal='missing'},
        @{field='verify_script';literal='null'},
        @{field='verify_script';literal='true'},
        @{field='verify_script';literal='"scripts/DoesNotExist.ps1"'},
        @{field='verify_script';literal='"scripts/../outside.ps1"'},
        @{field='verify_script';literal='"scripts/Apply-HeavenGg.ps1"'},
        @{field='verify_script';literal='["scripts/Test-HeavenGgRuntime.ps1"]'},
        @{field='apply_script';literal='"scripts/Test-HeavenGgRuntime.ps1"'},
        @{field='mode';literal='"self-update-release"'}
    )
    foreach ($case in $invalidRuntimeCases) {
        $policy = $source | ConvertFrom-Json
        if ($case.literal -eq 'missing') {
            $policy.runtime_update.PSObject.Properties.Remove($case.field)
        } else {
            $value = ('{"value":' + $case.literal + '}') | ConvertFrom-Json
            $policy.runtime_update.($case.field) = $value.value
        }
        $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temp -Encoding UTF8
        $failure = $null
        try { & $validator -PolicyPath $temp | Out-Null } catch { $failure = $_.Exception.Message }
        if ($failure -cne 'H1_RUNTIME_CONTRACT_INVALID') {
            throw "H1_RUNTIME_NEGATIVE_NOT_REJECTED: $($case.field)=$($case.literal); observed='$failure'"
        }
    }
    $policy = $source | ConvertFrom-Json
    $policy.kind = 'source'
    $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temp -Encoding UTF8
    $failure = $null
    try { & $validator -PolicyPath $temp | Out-Null } catch { $failure = $_.Exception.Message }
    if ($failure -cne 'H1_RUNTIME_CONTRACT_INVALID') { throw 'H1_SOURCE_ONLY_PRODUCT_POLICY_ACCEPTED' }
    $source | Set-Content -LiteralPath $temp -Encoding UTF8
    & $validator -PolicyPath $temp | Out-Null
    Write-Output 'H1_RUNTIME_POLICY_NEGATIVES_PASSED'
} finally {
    Remove-Item -LiteralPath $temp
}
