#requires -Version 5.1
[CmdletBinding()]
param(
 [string]$RepoRoot=(Join-Path $PSScriptRoot '..'),
 [ValidateSet('Apply','Start','Stop','Status')][string]$Mode='Apply',
 [string]$ExpectedSourceSha=''
)
$ErrorActionPreference='Stop'
# H1 only; H2 must never launch or alter the private service.
if([Environment]::MachineName -ine 'HEAVEN'){
 if($Mode -ne 'Apply'){throw 'HEAVEN1_REQUIRED'}
 '{"schema":"heaven.gg/private-host/v1","status":"NOT_TARGET"}'
 return
}
$RepoRoot=(Resolve-Path -LiteralPath $RepoRoot).Path
$node=Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
$script=Join-Path $RepoRoot 'web\private-host.mjs'
if(-not (Test-Path -LiteralPath $script -PathType Leaf)){throw 'PRIVATE_RUNTIME_SOURCE_MISSING'}
$names=@('NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED')
$saved=@{}
try{
 foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$null,'Process')}
 $argsList=@($script,$Mode,$RepoRoot)
 if($ExpectedSourceSha){$argsList+=@($ExpectedSourceSha)}
 & $node.Source @argsList
 if($LASTEXITCODE -ne 0){throw 'PRIVATE_RUNTIME_HOLD'}
}finally{
 foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
}
