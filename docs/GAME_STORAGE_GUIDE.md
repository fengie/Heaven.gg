# Game SSD and shader-cache placement

**Type:** source-backed research guidance adapted from the Heaven Toolbox October 17 game-cache investigation. **Not** an automatic cache mover, an installed utility, or measured performance improvement. Private workstation inventory is not in this public repo.

## Default decision by owner

| Content | Recommended starting point | Decision constraints |
| --- | --- | --- |
| Currently played games and their required mods | Fast supported game SSD; follow the launcher and mod-manager requirements | Use the title's supported move/reinstall mechanism to preserve updates and paths |
| Inactive game archives/backups | Capacity storage such as HDD, if no game still loads from there | Archive != active install; don't modify saves when moving |
| NVIDIA driver shader cache (DXCache, GLCache) | Leave at driver-managed location | NVIDIA documents a size control, not universal safe relocation to removable SSD |
| Windows Direct3D cache | Leave Windows-managed | Windows shader state is not game-owned mod/game data |
| Steam-managed shader cache | Let Steam/library own it | Avoid manual junctions and deletions while Steam is operating |
| Large optional game-owned cache | Review one cache at a time | Confirm actual source owner, cache-only state, target volume, free space, no reparse escapes, closed application, backups and rollback |

A universal "move all shaders and caches to E:" is not supported by evidence. NTFS junctions redirect filesystem paths but do not prove a driver, updater or game officially supports removable storage. Loss or remapping of an external SSD can break access. A folder called cache can contain durable saves, mods or state; do not mass-delete.

## Safe workflow

1. Obtain a bounded inventory of the *specified* cache directory and owner. Keep unknown directories unchanged.
2. Check official game/launcher-supported relocation first. Measure used bytes, source size, target free space and whether the directory is actively written.
3. If an individual junction pilot is still justified, run tests in a disposable directory first; obtain explicit local approval and record a reversible manifest, expected hashes and an unchanged backup.
4. With the application closed, independently recheck source/target/volume identity immediately before any move, and preserve both copies if verification is ambiguous.
5. Verify real game startup, shader compilation, updates and disconnect/reconnect. No observed improvement = no verified optimization; preserve ability to roll back.

**Primary reference material:** [Microsoft NTFS reparse points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points), [Microsoft mklink](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/mklink), [Microsoft Direct3D 12 pipeline state](https://learn.microsoft.com/en-us/windows/win32/direct3d12/manage-pipeline-state-in-direct3d-12), [NVIDIA Control Panel](https://www.nvidia.com/content/Control-Panel-Help/vLatest/en-us/mergedProjects/3D%20Settings/To_set_a_default_3D_setting.htm).

**Original research:** [Heaven Toolbox source at Oct 19](https://github.com/fengie/heaven-toolbox/blob/b557a0531021a483081f1932c44c69ff81b5bf8a/_AGENT_CONTEXT/RESEARCH_FINDINGS/summaries/2026-10-17-heaven2-shader-and-game-cache-placement.md). It may be inaccessible to public visitors because Toolbox is private. The user-requested Windows source transfer is indexed in [migration ledger](TOOLBOX_GAME_TRANSFER_2026_10_19.md). No new drive or PC action was run.
