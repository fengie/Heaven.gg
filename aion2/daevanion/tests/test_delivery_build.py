"""Exercise the actual production builder against real preserved input data."""
import copy
import hashlib
import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
TOOLBOX=ROOT.parents[2]/'heaven-toolbox/tools/graph-reconstruction'
spec=importlib.util.spec_from_file_location('daevanion_actual_builder',ROOT/'tools/build_outputs.py')
builder=importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)


def load(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, value): path.write_text(json.dumps(value,sort_keys=True,indent=2)+'\n',encoding='utf-8')


class ActualBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='daevanion-builder-tests-')
        cls.root=Path(cls.temp.name)/'data'
        shutil.copytree(ROOT,cls.root,ignore=shutil.ignore_patterns('__pycache__','.generated-*'))
    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()
    @contextmanager
    def editing(self,relative):
        p=self.root/relative; before=p.read_bytes(); doc=load(p)
        try:
            yield p,doc
        finally: p.write_bytes(before)
    def outputs(self):
        result={}
        for dirname in ('graphs','drafts','overlays'):
            for p in (self.root/dirname).glob('*'):
                if p.is_file(): result[str(p.relative_to(self.root))]=hashlib.sha256(p.read_bytes()).hexdigest()
        p=self.root/'evidence/board-summary.json'
        result[str(p.relative_to(self.root))]=hashlib.sha256(p.read_bytes()).hexdigest()
        return result
    def validate(self): return builder.validate_inputs(self.root,TOOLBOX)
    def test_check_mode_writes_nothing(self):
        before=self.outputs()
        self.assertEqual(builder.run(self.root,TOOLBOX,True),{'boards':5,'grid_positions':757})
        self.assertEqual(self.outputs(),before)
    def test_real_builder_counts_seven_trials_instead_of_claiming_twenty(self):
        paths=[self.root/'evidence/perturbation-design.json']+list((self.root/'evidence').glob('*-reconciliation.json'))
        backups={p:p.read_bytes() for p in paths}
        try:
            design=load(paths[0]); design['trials']=design['trials'][:7]; design['count_per_board']=7; write(paths[0],design)
            for p in paths[1:]:
                d=load(p); d['trial_grids']=d['trial_grids'][:7]
                for record in d['cells']:
                    record['sensitivity_labels']=record['sensitivity_labels'][:7]
                    record['sensitivity_agreement_with_a']=record['sensitivity_labels'].count(record['visual_a'])
                    record['all_variants_stable']=len(set(record['sensitivity_labels']))==1
                d['baseline_disagreements']=[r for r in d['cells'] if not r['agree']]
                d['unstable_cells']=[r for r in d['cells'] if not r['all_variants_stable']]
                write(p,d)
            builder.run(self.root,TOOLBOX)
            for p in (self.root/'graphs').glob('*.json'):
                graph=load(p); self.assertEqual(graph['validation']['sensitivity_runs'],7)
                for cell in graph['cells']:
                    self.assertEqual(cell['evidence']['sensitivity_trials'],7)
                    self.assertEqual(cell['evidence']['sensitivity_agreement'],7)
        finally:
            for p,raw in backups.items(): p.write_bytes(raw)
            builder.run(self.root,TOOLBOX)
    def test_legacy_false_agreement_reproduction_now_refused(self):
        before=self.outputs()
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            d['cells'][0]['agree']=False; write(p,d)
            with self.assertRaisesRegex(ValueError,'Contradictory'): builder.run(self.root,TOOLBOX)
        self.assertEqual(self.outputs(),before)
    def test_missing_record_refused(self):
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            d['cells'].pop(); write(p,d)
            with self.assertRaises(ValueError): self.validate()
    def test_duplicate_coordinate_refused(self):
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            d['cells'][-1]=d['cells'][0]; write(p,d)
            with self.assertRaises(ValueError): self.validate()
    def test_trial_grid_label_mismatch_refused(self):
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            d['cells'][0]['sensitivity_labels'][0]='x'; write(p,d)
            with self.assertRaises(ValueError): self.validate()
    def test_summary_cannot_erase_uncertainty(self):
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            r=d['cells'][0]; r['sensitivity_labels'][0]='x'; r['sensitivity_agreement_with_a']=19
            r['all_variants_stable']=False
            d['trial_grids'][0][0]='x'+d['trial_grids'][0][0][1:]
            write(p,d)  # stale unstable_cells=[] must not survive
            with self.assertRaisesRegex(ValueError,'summary contradicts'): self.validate()
    def test_genuine_sensitivity_disagreement_preserved(self):
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            r=d['cells'][0]; r['sensitivity_labels'][0]='x'; r['sensitivity_agreement_with_a']=19
            r['all_variants_stable']=False
            d['trial_grids'][0][0]='x'+d['trial_grids'][0][0][1:]
            d['unstable_cells']=[r]; write(p,d)
            result=self.validate()[3]['Nezekan']['observations'][(1,1)]
            self.assertEqual(result['sensitivity_agreement'],19)
            self.assertEqual(result['disagreeing_trial_numbers'],[1])
    def test_source_digest_mismatch_refused_before_any_output(self):
        before=self.outputs()
        with self.editing('calibration.json') as (p,d):
            d['Azphel']['source_sha256']='0'*64; write(p,d)
            with self.assertRaisesRegex(ValueError,'digest mismatch'): builder.run(self.root,TOOLBOX)
        self.assertEqual(self.outputs(),before)
    def test_source_size_mismatch_refused(self):
        with self.editing('calibration.json') as (p,d):
            d['Azphel']['source_size'][0]+=1; write(p,d)
            with self.assertRaisesRegex(ValueError,'dimensions mismatch'): self.validate()
    def test_wrong_board_identity_refused(self):
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            d['board']='Zikel'; write(p,d)
            with self.assertRaisesRegex(ValueError,'identity'): self.validate()
    def test_stale_board_coverage_refused(self):
        with self.editing('transcriptions/pass-b.json') as (p,d):
            del d['boards']['Azphel']; write(p,d)
            with self.assertRaisesRegex(ValueError,'coverage'): self.validate()
    def test_design_count_not_boolean(self):
        with self.editing('evidence/perturbation-design.json') as (p,d):
            d['count_per_board']=True; write(p,d)
            with self.assertRaises(ValueError): self.validate()
    def test_repeated_design_not_a_distinct_trial(self):
        with self.editing('evidence/perturbation-design.json') as (p,d):
            d['trials'][1]={**d['trials'][0],'id':2}; write(p,d)
            with self.assertRaisesRegex(ValueError,'Repeated trial'): self.validate()
    def test_fault_during_render_publishes_nothing_and_cleans_stage(self):
        before=self.outputs()
        with patch.object(builder,'render',side_effect=RuntimeError('injected renderer failure')):
            with self.assertRaises(RuntimeError): builder.run(self.root,TOOLBOX)
        self.assertEqual(self.outputs(),before)
        self.assertFalse(list(self.root.glob('.generated-*')))
    def test_input_mutation_during_real_render_refuses_publication(self):
        before=self.outputs(); real=builder.render; first=[True]
        with self.editing('evidence/Nezekan-reconciliation.json') as (p,d):
            def changed(*args,**kwargs):
                real(*args,**kwargs)
                if first[0]:
                    first[0]=False; d['note']='injected concurrent input change'; write(p,d)
            with patch.object(builder,'render',side_effect=changed):
                with self.assertRaisesRegex(ValueError,'Input changed during build'):
                    builder.run(self.root,TOOLBOX)
        self.assertEqual(self.outputs(),before)
        self.assertFalse(list(self.root.glob('.generated-*')))
    def test_input_change_during_validation_cannot_relabel_older_parsed_bytes(self):
        before=self.outputs(); real=builder.Image.open; first=[True]
        with self.editing('transcriptions/pass-a.json') as (p,d):
            def changed(*args,**kwargs):
                result=real(*args,**kwargs)
                if first[0]:
                    first[0]=False; d['concurrent_note']='changed after JSON parsing'; write(p,d)
                return result
            with patch.object(builder.Image,'open',side_effect=changed):
                with self.assertRaisesRegex(ValueError,'Input changed during build'):
                    builder.run(self.root,TOOLBOX)
        self.assertEqual(self.outputs(),before)

    def test_graph_records_input_digests(self):
        builder.run(self.root,TOOLBOX)
        for p in (self.root/'graphs').glob('*.json'):
            for rel,digest in load(p)['input_sha256'].items():
                self.assertEqual(hashlib.sha256((self.root/rel).read_bytes()).hexdigest(),digest)
    def test_rebuild_outputs_byte_identical(self):
        builder.run(self.root,TOOLBOX); before=self.outputs(); builder.run(self.root,TOOLBOX)
        self.assertEqual(self.outputs(),before)


if __name__=='__main__': unittest.main()
