#requires -Version 5.1
# Fixture-only Windows tests. Never touches physical SSD, game files, or the real desktop.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'New-HeavenGameShortcuts.ps1'
$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($tool, [ref]$tokens, [ref]$parseErrors)
if (@($parseErrors | Where-Object { $null -ne $_ }).Count -gt 0) {
    throw ('SCRIPT_PARSE_FAILED: ' + (@($parseErrors | Where-Object { $null -ne $_ } |
        ForEach-Object { $_.Message }) -join '; '))
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('heaven-game-shortcut-test-' + [guid]::NewGuid().ToString('N'))
$disk = Join-Path $root 'P30 Drive'
$links = Join-Path $root 'Heaven Tools\External SSD Games'
$steamApps = Join-Path $disk 'SteamLibrary\steamapps'
$gamePath = Join-Path $steamApps 'common\Test Game'
$genshinPath = Join-Path $disk 'Games\Genshin Impact Game'
$overwatchPath = Join-Path $disk 'Games\Overwatch\_retail_'
$steam = Join-Path $root 'Program Files\Steam\steam.exe'
$battle = Join-Path $root 'Program Files\Battle.net\Battle.net Launcher.exe'

function Ensure-TestFile {
    param([string]$Path)
    New-Item -ItemType Directory -Path (Split-Path -Path $Path -Parent) -Force | Out-Null
    Set-Content -LiteralPath $Path -Value 'fixture' -Encoding ASCII
}
function Invoke-TestScan {
    param([string]$Mode = 'Preview', [string]$SteamPath = $steam, [string]$BattlePath = $battle)
    $json = & $tool -Mode $Mode -DriveRoot $disk -OutputDirectory $links -SteamExe $SteamPath -BattleNetExe $BattlePath
    if (-not $json) { throw 'EMPTY_REPORT' }
    return ($json | ConvertFrom-Json)
}
function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "TEST_FAILED: $Message" }
}

try {
    Ensure-TestFile $steam
    Ensure-TestFile $battle
    Ensure-TestFile (Join-Path $gamePath 'Game.exe')
    Ensure-TestFile (Join-Path $genshinPath 'GenshinImpact.exe')
    Ensure-TestFile (Join-Path $overwatchPath 'Overwatch.exe')
    @'
"AppState"
{
    "appid" "12345"
    "name" "Test Game"
    "installdir" "Test Game"
}
'@ | Set-Content -LiteralPath (Join-Path $steamApps 'appmanifest_12345.acf') -Encoding UTF8
    @'
"AppState"
{
    "appid" "789"
    "name" "Unsafe"
    "installdir" "..\..\escape"
}
'@ | Set-Content -LiteralPath (Join-Path $steamApps 'appmanifest_789.acf') -Encoding UTF8

    $preview = Invoke-TestScan
    Assert-Condition ($preview.schema -eq 'heaven-toolbox/game-shortcuts/v1') 'schema'
    Assert-Condition ($preview.mode -eq 'Preview' -and $preview.created -eq 0) 'preview mode'
    Assert-Condition (@($preview.games).Count -eq 3) 'Steam, Genshin, Battle.net detected'
    Assert-Condition (-not (Test-Path -LiteralPath $links)) 'preview never creates folder'
    Assert-Condition (@($preview.warnings | Where-Object { $_ -like 'UNSAFE_MANIFEST_PATH*' }).Count -eq 1) 'manifest traversal rejected'
    Assert-Condition (@($preview.games | Where-Object { $_.kind -eq 'steam' -and $_.shortcut -like '*Steam 12345*' }).Count -eq 1) 'Steam AppID preserved'

    $result = Invoke-TestScan -Mode Create
    Assert-Condition ($result.created -eq 3 -and $result.skipped -eq 0) 'creates three shortcuts'
    $shortcuts = @(Get-ChildItem -LiteralPath $links -File -Filter '*.lnk')
    Assert-Condition ($shortcuts.Count -eq 3) 'three actual .lnk files exist'

    $wsh = New-Object -ComObject WScript.Shell
    $steamLink = $wsh.CreateShortcut((Join-Path $links 'Test Game (Steam 12345).lnk'))
    Assert-Condition ($steamLink.TargetPath -eq $steam -and $steamLink.Arguments -eq '-applaunch 12345') 'Steam launcher-aware shortcut'
    $genshinLink = $wsh.CreateShortcut((Join-Path $links 'Genshin Impact.lnk'))
    Assert-Condition ($genshinLink.TargetPath -eq (Join-Path $genshinPath 'GenshinImpact.exe')) 'Genshin executable shortcut'
    $owLinkPath = Join-Path $links 'Overwatch (Battle.net).lnk'
    $owLink = $wsh.CreateShortcut($owLinkPath)
    Assert-Condition ($owLink.TargetPath -eq $battle -and $owLink.Arguments -eq '--exec="launch Pro"') 'Overwatch via Battle.net'

    $again = Invoke-TestScan -Mode Create
    Assert-Condition ($again.created -eq 0 -and $again.reused -eq 3) 'idempotent regeneration'

    $owLink.TargetPath = Join-Path $root 'unrelated.exe'
    $owLink.Arguments = ''
    $owLink.Save()
    $collision = Invoke-TestScan -Mode Create
    Assert-Condition ($collision.created -eq 0 -and $collision.reused -eq 2 -and $collision.skipped -eq 1) 'collision skipped'
    Assert-Condition (($wsh.CreateShortcut($owLinkPath)).TargetPath -eq (Join-Path $root 'unrelated.exe')) 'collision not overwritten'

    $missingSteam = Invoke-TestScan -SteamPath (Join-Path $root 'missing-steam.exe')
    Assert-Condition (@($missingSteam.games | Where-Object kind -eq 'steam').Count -eq 0) 'missing Steam launcher is not bypassed'
    $missingBattle = Invoke-TestScan -BattlePath (Join-Path $root 'missing-bnet.exe')
    Assert-Condition (@($missingBattle.games | Where-Object kind -eq 'battle.net').Count -eq 0) 'missing Battle.net launcher is not bypassed'

    Write-Output 'PASS: PowerShell parse, preview, Steam manifest/traversal, Genshin, Overwatch, real COM links, idempotency, collision and launcher-missing fixtures'
} finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop
    }
}
