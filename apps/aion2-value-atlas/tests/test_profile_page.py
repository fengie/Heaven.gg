import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class ProfilePageTests(unittest.TestCase):
    def test_rebuild_is_deterministic_and_source_linked(self):
        before = (ROOT/'profile.html').read_bytes()
        subprocess.run([sys.executable, str(ROOT/'scripts/build.py')], check=True, capture_output=True)
        self.assertEqual(before, (ROOT/'profile.html').read_bytes())
        text = before.decode('utf-8')
        self.assertIn('heaven-gg/aion2-progression-catalog/v1', text)
        self.assertIn('PROFILE_EDITOR', text)
        self.assertNotIn('/* PROFILE_DATA_INSERT */', text)
        self.assertNotIn('/* PROFILE_ENGINE_INSERT */', text)

    def test_source_catalog_has_credible_provenance_and_no_fake_prices(self):
        data=json.loads((ROOT/'data/progression_catalog.json').read_text(encoding='utf-8'))
        sources={s['id']:s for s in data['sources']}
        self.assertIn('nc-patch-oct14', sources)
        self.assertEqual(sources['nc-patch-oct14']['grade'], 'primary')
        for row in data['gearExamples']:
            self.assertIn(row['sourceId'],sources)
            self.assertNotIn('kinaPrice',row)

if __name__=='__main__':
    unittest.main()
