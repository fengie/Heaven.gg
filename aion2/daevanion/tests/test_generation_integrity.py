"""Real builder/report integration; no game weights or purchase rules invented."""
from pathlib import Path
import sys,json,tempfile,shutil,hashlib,unittest
from unittest.mock import patch
from contextlib import contextmanager
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import build_outputs as builder
import build_report as report
import generation_evidence as generation
TOOLBOX=builder.TOOLBOX

class GenerationIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.root=Path(cls.tmp.name)/'game'
        shutil.copytree(ROOT,cls.root,ignore=shutil.ignore_patterns('__pycache__'))
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    @contextmanager
    def edit(self,relative,raw=None):
        p=self.root/relative;before=p.read_bytes()
        try:
            if raw is not None:p.write_bytes(raw)
            yield p
        finally:p.write_bytes(before)
    @contextmanager
    def reseal_graph_fixture(self):
        # Locally reseal a controlled fixture to exercise semantic validation too.
        # This does NOT create authority; receipts are deliberately not signatures.
        with self.edit('graphs/Nezekan.json') as p,self.edit(generation.RECEIPT) as receipt:
            graph=json.loads(p.read_bytes());yield graph
            p.write_text(json.dumps(graph),encoding='utf-8')
            doc=json.loads(receipt.read_bytes())
            item=next(x for x in doc['files'] if x['path']=='graphs/Nezekan.json')
            item.update(sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
            receipt.write_text(json.dumps(doc),encoding='utf-8')
            with self.assertRaises(ValueError):report.render_report(self.root)
    def test_generation_receipt_matches_all_outputs(self):
        snap=generation.generation_snapshot(self.root,TOOLBOX)
        self.assertEqual(len(snap['receipt']['files']),31)
        self.assertEqual(set(snap['receipt']['input_sha256']),generation.expected_inputs())
    def test_modified_png_refused(self):
        with self.edit('drafts/Nezekan.png',b'not a PNG'):
            with self.assertRaises(ValueError):report.render_report(self.root)
    def test_modified_text_refused(self):
        with self.edit('drafts/Nezekan.txt',b'FALSE TEST PAYLOAD'):
            with self.assertRaises(ValueError):report.render_report(self.root)
    def test_valid_receipt_still_requires_boolean_occupancy(self):
        with self.reseal_graph_fixture() as graph:
            next(c for c in graph['cells'] if not c['occupied'])['occupied']='false'
    def test_valid_receipt_still_requires_correct_symbol(self):
        with self.reseal_graph_fixture() as graph:graph['cells'][0]['symbol']='fabricated'
    def test_valid_receipt_still_requires_input_coverage(self):
        with self.reseal_graph_fixture() as graph:graph['input_sha256']={}
    def test_valid_receipt_cannot_inflate_confidence(self):
        with self.reseal_graph_fixture() as graph:graph['cells'][0]['evidence']['sensitivity_agreement']=999
    def test_valid_receipt_cannot_change_start(self):
        with self.reseal_graph_fixture() as graph:graph['start']='r01c01'
    def test_duplicate_json_keys_refused_at_input_boundary(self):
        p=self.root/'transcriptions/pass-a.json'
        with self.edit('transcriptions/pass-a.json',b'{"boards":{},'+p.read_bytes()[1:]):
            with self.assertRaisesRegex(ValueError,'Duplicate'):builder.validate_inputs(self.root,TOOLBOX)
    def test_missing_receipt_preserves_report(self):
        with self.edit(generation.RECEIPT) as p,self.edit('REPORT.html',b'old report'):
            p.unlink()
            with self.assertRaises((ValueError,OSError)):report.build_report(self.root)
            self.assertEqual((self.root/'REPORT.html').read_bytes(),b'old report')
    def test_cache_hit_does_not_call_renderer(self):
        with patch.object(builder,'render',side_effect=AssertionError('cache rendered')):
            result=builder.run(self.root,TOOLBOX,reuse_verified=True)
        self.assertEqual(sum(b['grid_positions'] for b in result),757)
    def test_stale_output_does_not_get_cache_hit(self):
        with self.edit('drafts/Nezekan.txt',b'stale'),patch.object(builder,'render',side_effect=RuntimeError('cache invalidated')):
            with self.assertRaisesRegex(RuntimeError,'invalidated'):builder.run(self.root,TOOLBOX,reuse_verified=True)
    def test_changed_producer_invalidates_cache(self):
        with self.edit('tools/build_outputs.py') as p:
            p.write_bytes(p.read_bytes()+b'\n# controlled producer drift\n')
            with patch.object(builder,'render',side_effect=RuntimeError('cache invalidated')):
                with self.assertRaises(RuntimeError):builder.run(self.root,TOOLBOX,reuse_verified=True)
    def test_report_reads_immutable_snapshot_and_rechecks_changes(self):
        real=report.base64.b64encode;first=[True]
        with self.edit('drafts/Nezekan.txt') as p,self.edit('REPORT.html',b'old report'):
            def changed(data):
                if first[0]:first[0]=False;p.write_bytes(b'concurrent edit')
                return real(data)
            with patch.object(report.base64,'b64encode',side_effect=changed):
                with self.assertRaises(ValueError):report.build_report(self.root)
            self.assertEqual((self.root/'REPORT.html').read_bytes(),b'old report')
    def test_output_directory_symlink_refused(self):
        p=self.root/'drafts';real=self.root/'original-drafts';p.rename(real)
        try:
            p.symlink_to(real,target_is_directory=True)
            with self.assertRaises(ValueError):report.render_report(self.root)
        finally:p.unlink();real.rename(p)
    def test_interrupted_publish_has_no_valid_new_receipt(self):
        # Use a separate fixture because some legacy outputs may be replaced before
        # an injected publish failure. Readers must reject that mixed generation.
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'game';shutil.copytree(self.root,root)
            p=root/'transcriptions/pass-a.json';doc=json.loads(p.read_bytes());doc['note']='new generation';p.write_text(json.dumps(doc))
            real=builder.os.replace;count=[0]
            def fail_midway(src,dst):
                count[0]+=1
                if count[0]==8:raise OSError('injected publication failure')
                return real(src,dst)
            with patch.object(builder.os,'replace',side_effect=fail_midway):
                with self.assertRaises(OSError):builder.run(root,TOOLBOX)
            with self.assertRaises(ValueError):generation.generation_snapshot(root,TOOLBOX)
            self.assertFalse(list(root.glob('.generated-*')))

if __name__=='__main__':unittest.main()
