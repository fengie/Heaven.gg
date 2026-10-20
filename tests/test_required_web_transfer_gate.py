"""Regression: the protected child 'test' context must exercise web and reviewed Toolbox copies.

This guards CI wiring only. Policy/verifier from candidate source is not a
trusted-base judicial verdict, and this test does not replace native Windows
fixtures, independent live Pages readback, or repository ruleset enforcement.
"""
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "tests.yml"
PACKAGE = ROOT / "package.json"
TRANSFER = ROOT / "data" / "research" / "toolbox-game-transfer-2026-10-19.json"
GAME_IMPORT_TEST = ROOT / "web" / "tests" / "game-import.test.mjs"


class RequiredChildReleaseProofTests(unittest.TestCase):
    def test_required_python_check_also_runs_web_transfer_and_build(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertRegex(workflow, r"(?m)^jobs:\s*\n  test:\s*\n")
        self.assertIn("pull_request:", workflow)
        self.assertNotIn("pull_request_target:", workflow)
        self.assertNotRegex(workflow, r"(?m)^\s+paths:\s*$")
        self.assertRegex(workflow, r"(?m)^permissions:\s*\n  contents: read\s*$")
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("node-version: '22'", workflow)
        self.assertIn("npm run check:web", workflow)
        self.assertIn("python -m unittest discover -s tests -v", workflow)
        self.assertNotIn("continue-on-error:", workflow)

    def test_web_check_includes_all_browser_contracts_and_static_build(self):
        scripts = json.loads(PACKAGE.read_text(encoding="utf-8"))["scripts"]
        self.assertIn("web/tests/*.test.mjs", scripts["test:web"])
        self.assertIn("npm run test:web", scripts["check:web"])
        self.assertIn("npm run build", scripts["check:web"])
        self.assertTrue(GAME_IMPORT_TEST.is_file())

    def test_child_transfer_is_pinned_and_keeps_full_original_manifest(self):
        manifest = json.loads(TRANSFER.read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema"], "heaven-gg/toolbox-game-transfer/v1")
        self.assertEqual(manifest["sourceRepository"], "fengie/heaven-toolbox")
        self.assertEqual(manifest["sourceRevision"], "b557a0531021a483081f1932c44c69ff81b5bf8a")
        self.assertEqual(manifest["destinationRepository"], "fengie/Heaven.gg")
        self.assertEqual(len(manifest["entries"]), 12)
        self.assertEqual(len({r["childPath"] for r in manifest["entries"]}), 12)
        source = GAME_IMPORT_TEST.read_text(encoding="utf-8")
        self.assertIn("sourceGitBlob", source)
        self.assertIn("gitBlobSha(bytes)", source)


if __name__ == "__main__":
    unittest.main()
