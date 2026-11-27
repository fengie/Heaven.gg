"""Transfer only reviewed generated public data to a separate publisher.

The generation job is read-only; the publisher never executes the generated
files. A same-run artifact is not independent provenance. Verify its bytes,
exact source, allowlisted regular file changes and resulting tree before push.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

REPOSITORY = "fengie/Heaven.gg"
MAX_PATCH = 32 * 1024 * 1024
MAX_MANIFEST = 16 * 1024
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
CATALOG = frozenset("data/catalog/" + name for name in (
    "catalog_manifest.json", "item_stat_schema.json", "priority_gear_lookup.json",
    "rogue_endgame_items.json",
))
GAME = frozenset("data/game/" + name for name in (
    "all_bonus_names.json", "all_item_bonuses.jsonl.gz", "combat_mobs.jsonl.gz",
    "field_inventory.json", "item_mob_references.jsonl.gz", "item_names.tsv",
    "item_rarity_metadata.jsonl.gz", "item_rarity_summary.json",
    "item_release_status.jsonl.gz", "items.jsonl.gz", "manifest.json",
    "mob_drop_records.jsonl.gz", "mobs.jsonl.gz", "other_structured_base.json.gz",
    "quality_report.json", "questlines.json.gz", "release_status_summary.json",
    "spotlight_mobs.jsonl.gz",
))
OUTPUTS = {
    "catalog": CATALOG,
    "codex": frozenset({"data/reference/codex_skill_panel_observations.json"}),
    "game": GAME,
    "gear": frozenset({"data/game/item_release_status.jsonl.gz",
                       "data/game/release_status_summary.json",
                       "data/catalog/priority_gear_lookup.json",
                       "data/catalog/item_stat_schema.json"}),
    "planner": frozenset({"data/pets/pets_and_tiers.json",
                          "data/planner/skill_snapshot_rankings.json",
                          "data/planner/demo_report.json", "data/community/market_summary.json",
                          "data/game/item_rarity_summary.json",
                          "data/game/item_rarity_metadata.jsonl.gz"}),
}


class PublicationError(RuntimeError):
    pass


def require(ok, reason):
    if not ok:
        raise PublicationError(reason)


def git(repo, *args, index=None, check=True, input_bytes=None):
    env = os.environ.copy()
    # An alternate index is only ever an owned temporary validation index.
    for key in ("GIT_INDEX_FILE", "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"):
        env.pop(key, None)
    env.update(GIT_NO_REPLACE_OBJECTS="1", GIT_OPTIONAL_LOCKS="0",
               GIT_TERMINAL_PROMPT="0")
    if index is not None:
        env["GIT_INDEX_FILE"] = str(index)
    result = subprocess.run(
        ["git", "-C", str(repo), "-c", "core.hooksPath=/dev/null",
         "-c", "core.fsmonitor=false", *args],
        input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, timeout=120, check=False,
    )
    if check:
        require(result.returncode == 0, "GIT_OPERATION_FAILED")
    return result


def head(repo):
    return git(repo, "rev-parse", "HEAD").stdout.decode("ascii").strip()


def binding(repo, kind, base):
    require(kind in OUTPUTS and isinstance(base, str) and SHA.fullmatch(base),
            "INVALID_SOURCE_OR_KIND")
    require(head(repo) == base, "SOURCE_REVISION_MISMATCH")


def decode_paths(raw):
    if not raw:
        return []
    require(raw.endswith(b"\0"), "INVALID_GIT_PATHS")
    try:
        paths = raw[:-1].decode("utf-8").split("\0")
    except UnicodeError as error:
        raise PublicationError("INVALID_GIT_PATHS") from error
    require(len(paths) == len(set(paths)), "DUPLICATE_GIT_PATH")
    return paths


def staged(repo, kind, index=None):
    raw = git(repo, "diff", "--cached", "--raw", "-z", "--no-renames",
              "--no-abbrev", "--no-ext-diff", index=index).stdout
    if not raw:
        return []
    require(raw.endswith(b"\0"), "INVALID_STAGED_DIFF")
    rows = raw[:-1].split(b"\0")
    require(len(rows) % 2 == 0, "INVALID_STAGED_DIFF")
    names = []
    for meta, filename in zip(rows[::2], rows[1::2]):
        try:
            match = re.fullmatch(rb":([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMD])", meta)
            name = filename.decode("utf-8")
        except UnicodeError as error:
            raise PublicationError("INVALID_STAGED_DIFF") from error
        require(match is not None and name in OUTPUTS[kind] and name not in names,
                "UNAPPROVED_GENERATED_PATH")
        old, new, _, _, status = match.groups()
        # Generators replace regular public data, not symlinks, gitlinks,
        # executables or whole directories. Deletions need an explicit change.
        require(status in (b"A", b"M") and old in (b"000000", b"100644")
                and new == b"100644", "UNAPPROVED_GENERATED_MODE")
        names.append(name)
    return sorted(names)


def dirty_paths(repo):
    modified = decode_paths(git(repo, "diff", "--name-only", "-z",
                                "--no-renames", "--no-ext-diff").stdout)
    untracked = decode_paths(git(repo, "ls-files", "--others", "--exclude-standard",
                                 "-z").stdout)
    return set(modified + untracked)


def ensure_clean(repo):
    require(not git(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all").stdout,
            "PUBLISHER_CHECKOUT_NOT_CLEAN")


def check_bundle_location(repo, bundle):
    require(not bundle.exists() and not bundle.is_symlink(), "BUNDLE_ALREADY_EXISTS")
    require(not bundle.resolve().is_relative_to(repo.resolve()),
            "BUNDLE_MUST_BE_OUTSIDE_CHECKOUT")


def prepare(repo, kind, base, bundle):
    repo, bundle = Path(repo), Path(bundle)
    binding(repo, kind, base)
    check_bundle_location(repo, bundle)
    require(not git(repo, "diff", "--cached", "--name-only", "-z").stdout,
            "GENERATOR_INDEX_ALREADY_CHANGED")
    paths = dirty_paths(repo)
    require(paths <= OUTPUTS[kind], "UNAPPROVED_GENERATOR_OUTPUT")
    if paths:
        git(repo, "add", "-A", "--", *sorted(paths))
    changed = staged(repo, kind)
    require(set(changed) == paths, "GENERATOR_PATH_SET_CHANGED")
    patch = git(repo, "diff", "--cached", "--binary", "--full-index",
                "--no-renames", "--no-ext-diff", "--no-textconv").stdout
    require(len(patch) <= MAX_PATCH, "PATCH_TOO_LARGE")
    tree = git(repo, "write-tree").stdout.decode("ascii").strip()
    require(SHA.fullmatch(tree) and head(repo) == base, "GENERATOR_SOURCE_CHANGED")
    manifest = {"schema": 1, "kind": kind, "base": base, "tree": tree,
                "changed": changed, "patch_sha256": hashlib.sha256(patch).hexdigest()}
    bundle.mkdir()
    (bundle / "candidate.patch").write_bytes(patch)
    (bundle / "manifest.json").write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
    return manifest


def bounded_file(path, limit):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= limit,
            "INVALID_BUNDLE_FILE")
    with path.open("rb") as stream:
        value = stream.read(limit + 1)
    require(len(value) == info.st_size and len(value) <= limit, "BUNDLE_SIZE_CHANGED")
    return value


def apply_candidate(repo, kind, base, bundle):
    repo, bundle = Path(repo), Path(bundle)
    binding(repo, kind, base)
    ensure_clean(repo)
    require(bundle.is_dir() and not bundle.is_symlink() and
            not bundle.resolve().is_relative_to(repo.resolve()) and
            {p.name for p in bundle.iterdir()} == {"manifest.json", "candidate.patch"},
            "INVALID_BUNDLE_DIRECTORY")
    try:
        manifest = json.loads(bounded_file(bundle / "manifest.json", MAX_MANIFEST))
        patch = bounded_file(bundle / "candidate.patch", MAX_PATCH)
    except (OSError, ValueError, UnicodeError) as error:
        raise PublicationError("INVALID_BUNDLE") from error
    require(isinstance(manifest, dict) and set(manifest) ==
            {"schema", "kind", "base", "tree", "changed", "patch_sha256"}
            and type(manifest["schema"]) is int and manifest["schema"] == 1
            and manifest["kind"] == kind and manifest["base"] == base
            and isinstance(manifest["tree"], str) and SHA.fullmatch(manifest["tree"])
            and isinstance(manifest["patch_sha256"], str) and DIGEST.fullmatch(manifest["patch_sha256"])
            and manifest["patch_sha256"] == hashlib.sha256(patch).hexdigest(),
            "BUNDLE_IDENTITY_MISMATCH")
    names = manifest["changed"]
    require(isinstance(names, list) and all(isinstance(p, str) and p in OUTPUTS[kind] for p in names)
            and names == sorted(set(names)) and bool(names) == bool(patch),
            "BUNDLE_PATH_SCOPE_MISMATCH")
    # Independently apply to an isolated index first. A forged manifest cannot
    # admit a different path, executable, symlink, deletion or unexpected tree.
    # No candidate bytes are executed; the publisher is a disposable checkout.
    with tempfile.TemporaryDirectory(prefix="generated-index-") as tmp:
        index = Path(tmp) / "index"
        git(repo, "read-tree", base, index=index)
        if patch:
            git(repo, "apply", "--cached", "--binary", "-", index=index, input_bytes=patch)
        require(staged(repo, kind, index=index) == names, "PATCH_SCOPE_MISMATCH")
        require(git(repo, "write-tree", index=index).stdout.decode("ascii").strip() ==
                manifest["tree"], "PATCH_TREE_MISMATCH")
    binding(repo, kind, base)
    ensure_clean(repo)
    if patch:
        git(repo, "apply", "--index", "--check", "--binary", "-", input_bytes=patch)
        git(repo, "apply", "--index", "--binary", "-", input_bytes=patch)
    require(staged(repo, kind) == names and
            git(repo, "write-tree").stdout.decode("ascii").strip() == manifest["tree"],
            "PUBLISHER_TREE_MISMATCH")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "publish"])
    parser.add_argument("kind", choices=sorted(OUTPUTS))
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    repo = Path.cwd()
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY and
            os.environ.get("GITHUB_REF") == "refs/heads/main" and
            os.environ.get("GITHUB_EVENT_NAME") in ("push", "workflow_dispatch"),
            "CANONICAL_MAIN_EVENT_REQUIRED")
    base = os.environ.get("GITHUB_SHA", "")
    if args.operation == "prepare":
        manifest = prepare(repo, args.kind, base, args.bundle)
    else:
        manifest = apply_candidate(repo, args.kind, base, args.bundle)
        if manifest["changed"]:
            # The write-enabled checkout is present ONLY in this publisher.
            # Non-force push of a single child of the exact base is the final CAS.
            git(repo, "fetch", "--no-tags", "origin", "refs/heads/main")
            require(git(repo, "rev-parse", "FETCH_HEAD").stdout.decode("ascii").strip() ==
                    base, "CANONICAL_MAIN_MOVED")
            git(repo, "-c", "user.name=github-actions[bot]",
                "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                "commit", "-m", "data: refresh verified " + args.kind + " snapshot")
            require(git(repo, "rev-parse", "HEAD^").stdout.decode("ascii").strip() == base
                    and git(repo, "rev-parse", "HEAD^{tree}").stdout.decode("ascii").strip() ==
                    manifest["tree"], "COMMIT_IDENTITY_MISMATCH")
            git(repo, "push", "origin", "HEAD:refs/heads/main")
    print(json.dumps({"kind": args.kind, "base": base, "changed": len(manifest["changed"]),
                      "tree": manifest["tree"]}, sort_keys=True))


if __name__ == "__main__":
    main()
