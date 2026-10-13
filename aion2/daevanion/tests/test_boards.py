import unittest,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TOOLBOX=ROOT.parents[2]/'heaven-toolbox/tools/graph-reconstruction'
sys.path.insert(0,str(TOOLBOX))
from evidence_grid import validate_grid
from graph_core import load_verified_graph
EXPECTED={'Nezekan':(11,89),'Zikel':(11,89),'Vaizel':(11,89),'Triniel':(13,117),'Azphel':(15,153)}
def boards():return [(n,json.loads((ROOT/'graphs'/f'{n}.json').read_text())) for n in EXPECTED]
class BoardTests(unittest.TestCase):
    def test_correct_dimensions_not_legacy_assumption(self):
        for n,g in boards():self.assertEqual((g['grid']['rows'],g['grid']['columns']),(EXPECTED[n][0],)*2)
    def test_full_coverage_757_not_605(self):
        self.assertEqual(sum(len(g['cells']) for n,g in boards()),757)
    def test_visible_nodes_537(self):
        self.assertEqual(sum(len(g['nodes']) for n,g in boards()),537)
    def test_per_board_node_counts(self):
        for n,g in boards():self.assertEqual(len(g['nodes']),EXPECTED[n][1])
    def test_one_center_start(self):
        for n,g in boards():
            starts=[z for z in g['cells'] if z['symbol']=='start'];self.assertEqual(len(starts),1)
            self.assertEqual((starts[0]['row'],starts[0]['column']),((EXPECTED[n][0]+1)//2,)*2)
    def test_complete_coordinates(self):
        for n,g in boards():self.assertTrue(validate_grid(g['grid']['rows'],g['grid']['columns'],g['cells'],g['grid']['source_size']))
    def test_no_invented_weights_or_verified_edges(self):
        for n,g in boards():
            self.assertEqual(g['verified_edges'],[]);self.assertIsNone(g['optimal_path'])
            self.assertTrue(all(z['acquisition_cost'] is None for z in g['cells']))
    def test_unsafe_optimization_rejected(self):
        for n,g in boards():
            with self.assertRaises(ValueError):load_verified_graph(g)
    def test_pixel_visual_agreement(self):
        a=json.loads((ROOT/'transcriptions/pass-a.json').read_text())['boards'];b=json.loads((ROOT/'transcriptions/pass-b.json').read_text())['boards'];self.assertEqual(a,b)
    def test_twenty_sensitivity_trials(self):
        for n in EXPECTED:
            d=json.loads((ROOT/'evidence'/f'{n}-reconciliation.json').read_text())
            self.assertEqual(len(d['trial_grids']),20)
            for z in d['cells']:self.assertEqual(len(z['sensitivity_labels']),20)
    def test_no_statistical_confidence_fabricated(self):
        for n,g in boards():
            for z in g['cells']:self.assertIsNone(z['evidence']['probability_of_correctness'])
    def test_original_hashes(self):
        for n,g in boards():self.assertEqual(hashlib.sha256((ROOT/'originals'/f'{n}.png').read_bytes()).hexdigest(),g['grid']['source_sha256'])
    def test_drafts_and_row_crops(self):
        for n,g in boards():
            for ext in ('png','svg','txt'):self.assertTrue((ROOT/'drafts'/f'{n}.{ext}').is_file())
            self.assertEqual(len(list((ROOT/'row-crops').glob(f'{n}-r*.png'))),EXPECTED[n][0])
    def test_official_nonstart_count_corroboration(self):
        d=json.loads((ROOT/'research/official-count-corroboration.json').read_text())['observed_board_denominators']
        for n,g in boards():self.assertEqual(len(g['nodes'])-1,d[n])
    def test_geometric_pairs_not_game_edges(self):
        for n,g in boards():
            for e in g['geometric_neighbor_candidates']:
                self.assertEqual(e['game_adjacency_status'],'unverified_geometric_candidate');self.assertIsNone(e['weight']);self.assertIn(e['u'],g['nodes']);self.assertIn(e['v'],g['nodes'])
if __name__=='__main__':unittest.main()
