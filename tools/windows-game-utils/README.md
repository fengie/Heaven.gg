# Windows game utilities — public migration preview

These 12 Windows PowerShell 5.1 files are exact content copies of game-specific source and isolated fixtures from Heaven Toolbox main at b557a0531021a483081f1932c44c69ff81b5bf8a. The original parent Git blob identities are recorded in data/research/toolbox-game-transfer-2026-10-19.json.

| Utility | Safe initial use | Explicit effects requiring consent |
| --- | --- | --- |
| New-HeavenGameShortcuts.ps1 | -Mode Preview -DriveRoot E: | -Mode Create writes shortcuts, not game installs |
| Inspect-HeavenGameCaches.ps1 | Bounded inventory | None |
| Invoke-HeavenGameCachePlacement.ps1 | -Mode Preview with reviewed manifest | Apply/Rollback require backups and verification |
| Start-HeavenGameCacheTools.ps1 | -Mode Report -NoPrompt | Guided Move/Undo restricted to compatible host |
| Repair-SteamShortcutIcons.ps1 | -Mode Inspect | -Mode Repair updates backed-up icon references |
| Repair-DesktopShortcutIcons.ps1 | -Mode Inspect | -Mode Repair updates approved icon references |

Scripts retain their original defaults and host/file guards. They are not automatically installed or universal tools for arbitrary PCs. Some cache code assumes a particular Windows host and drive layout. Review the source and rollback before any real game-machine mutation.

The new Game utilities Windows fixtures workflow runs the original isolated fixture scripts under Windows PowerShell 5.1 on a disposable hosted Windows runner. This proves neither that a particular game launches nor that the scripts are installed on Heaven2. Physical acceptance remains UNVERIFIED.

The private Toolbox installer Install-HeavenGameCacheTools.ps1 was not copied because it pins private source. No scheduled agents, startup installers, game moves, system edits or background processes were initiated by this migration.

This is a one-time connector-mediated copy, not an automated parent-to-child synchronization. See docs/TOOLBOX_GAME_TRANSFER_2026_10_19.md for acceptance, issues and source links.
