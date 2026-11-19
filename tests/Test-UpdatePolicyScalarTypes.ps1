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
} finally {
    Remove-Item -LiteralPath $temp
}
