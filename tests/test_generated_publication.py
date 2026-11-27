"""Test the real offline generator/publisher handoff in disposable Git repos."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

from ch_tables.generated_publication import prepare, apply_candidate, PublicationError, OUTPUTS

ROOT = Path(__file__).resolve().parents[1]


class GeneratedPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.bundle = self.root / "bundle"
        self.git("init", "-q")
        self.git("config", "user.name", "fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.put("data/catalog/catalog_manifest.json", b"old\n")
        self.put("README.md", b"unchanged\n")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").strip()
    
    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args],
                                       text=True, stderr=subprocess.STDOUT)

    def put(self, name, content):
        p = self.repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)

    def reset(self):
        self.git("reset", "--hard", self.base)
        self.git("clean", "-fd")

    def test_isolated_exact_patch_roundtrip(self):
        self.put("data/catalog/catalog_manifest.json", b"new\n")
        self.put("data/catalog/item_stat_schema.json", b"new schema\n")
        result = prepare(self.repo, "catalog", self.base, self.bundle)
        self.assertEqual(result["changed"], ["data/catalog/catalog_manifest.json",
                                             "data/catalog/item_stat_schema.json"])
        self.reset()
        apply_candidate(self.repo, "catalog", self.base, self.bundle)
        self.assertEqual(self.git("write-tree").strip(), result["tree"])
        self.assertEqual(self.git("rev-parse", "HEAD").strip(), self.base)
        self.assertEqual((self.repo / "README.md").read_bytes(), b"unchanged\n")
        self.assertEqual((self.repo / "data/catalog/catalog_manifest.json").read_bytes(), b"new\n")

    def test_no_change_is_an_explicit_empty_handoff(self):
        result = prepare(self.repo, "catalog", self.base, self.bundle)
        self.assertEqual(result["changed"], [])
        self.assertEqual((self.bundle / "candidate.patch").read_bytes(), b"")
        apply_candidate(self.repo, "catalog", self.base, self.bundle)
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_unexpected_outputs_and_staged_code_are_refused(self):
        self.put("README.md", b"not authorized\n")
        self.git("add", "README.md")
        with self.assertRaises(PublicationError):
            prepare(self.repo, "catalog", self.base, self.bundle)
        self.reset()
        self.put("data/catalog/arbitrary.json", b"unknown\n")
        with self.assertRaises(PublicationError):
            prepare(self.repo, "catalog", self.base, self.bundle)

    def test_tamper_wrong_base_and_nonregular_mode_are_refused(self):
        self.put("data/catalog/catalog_manifest.json", b"new\n")
        prepare(self.repo, "catalog", self.base, self.bundle)
        self.reset()
        with self.assertRaises(PublicationError):
            apply_candidate(self.repo, "catalog", "1" * 40, self.bundle)
        patch = self.bundle / "candidate.patch"
        patch.write_bytes(patch.read_bytes() + b"tamper")
        with self.assertRaises(PublicationError):
            apply_candidate(self.repo, "catalog", self.base, self.bundle)
        self.assertEqual(self.git("status", "--porcelain"), "")
        self.git("update-index", "--chmod=+x", "data/catalog/catalog_manifest.json")
        with self.assertRaises(PublicationError):
            prepare(self.repo, "catalog", self.base, self.root / "second")

    def test_recomputed_manifest_cannot_admit_outside_path(self):
        self.put("data/catalog/catalog_manifest.json", b"new\n")
        prepare(self.repo, "catalog", self.base, self.bundle)
        self.reset()
        self.put("README.md", b"outside\n")
        self.git("add", "README.md")
        patch = subprocess.check_output(["git", "-C", str(self.repo), "diff", "--cached",
                                         "--binary", "--full-index", "--no-renames"])
        forged = json.loads((self.bundle / "manifest.json").read_text())
        forged.update(changed=["README.md"], patch_sha256=hashlib.sha256(patch).hexdigest(),
                      tree=self.git("write-tree").strip())
        (self.bundle / "candidate.patch").write_bytes(patch)
        (self.bundle / "manifest.json").write_text(json.dumps(forged))
        self.reset()
        with self.assertRaises(PublicationError):
            apply_candidate(self.repo, "catalog", self.base, self.bundle)
        self.assertEqual(self.git("status", "--porcelain"), "")


class WorkflowBoundaryTests(unittest.TestCase):
    def test_generation_jobs_do_not_receive_write_scope_and_actions_are_pinned(self):
        names = {"catalog-import": "catalog", "codex-skill-import": "codex",
                 "full-game-import": "game", "gear-release-status": "gear",
                 "planner-research": "planner"}
        self.assertEqual(set(names.values()), set(OUTPUTS))
        for file, kind in names.items():
            source = (ROOT / ".github/workflows" / (file + ".yml")).read_text()
            self.assertIn("branches: [main]", source, file)
            self.assertIn("permissions:\n  contents: read", source, file)
            generate, publish = source.split("\n  publish:\n", 1)
            self.assertIn("persist-credentials: false", generate, file)
            self.assertNotIn("contents: write", generate, file)
            self.assertIn("generated_publication prepare " + kind, generate, file)
            self.assertIn("contents: write", publish, file)
            self.assertIn("generated_publication publish " + kind, publish, file)
            self.assertIn("github.ref == 'refs/heads/main'", publish, file)
            self.assertNotIn("git push", generate, file)
        for file in (ROOT / ".github/workflows").glob("*.yml"):
            for action in re.findall(r"^\s*(?:-\s+)?uses:\s*([^\s#]+)", file.read_text(), re.M):
                if not action.startswith("./"):
                    self.assertRegex(action, r"@[0-9a-f]{40}$", str(file))
