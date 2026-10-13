"""Exercise the delivered script-free report and its actual embedded bytes."""
import base64
from contextlib import contextmanager
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('actual_board_report',ROOT/'tools/build_report.py')
report=importlib.util.module_from_spec(spec);spec.loader.exec_module(report)

class Tags(HTMLParser):
    def __init__(self,text):
        super().__init__();self.tags=[];self.text=[];self.feed(text)
    def handle_starttag(self,tag,attrs): self.tags.append((tag,dict(attrs)))
    def handle_data(self,data):self.text.append(data)

class ReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='daevanion-report-tests-')
        cls.root=Path(cls.temp.name)/'data'
        shutil.copytree(ROOT,cls.root,ignore=shutil.ignore_patterns('__pycache__'))
        cls.rendered=report.render_report(cls.root);cls.parsed=Tags(cls.rendered)
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    @contextmanager
    def graph(self):
        p=self.root/'graphs/Nezekan.json';raw=p.read_bytes();d=json.loads(raw)
        try:yield p,d
        finally:p.write_bytes(raw)
    def write(self,p,d):p.write_text(json.dumps(d),encoding='utf-8')
    def test_five_board_sections_and_actual_counts(self):
        sections=[a['id'] for t,a in self.parsed.tags if t=='section']
        self.assertEqual(sections,list(report.BOARDS))
        for value in ['757','537','220','Observation report, not a playable route optimizer.']:
            self.assertIn(value,self.parsed.text)
    def test_no_scripts_or_external_resources(self):
        for tag,attrs in self.parsed.tags:
            self.assertNotIn(tag,['script','iframe','link','object','embed'])
            for key,value in attrs.items():
                self.assertFalse(key.lower().startswith('on'))
                if key in ('src','href'):self.assertTrue(value.startswith(('data:','#')))
        self.assertNotIn('@import',self.rendered)
        self.assertNotIn('url(',self.rendered)
    def test_embedded_json_matches_delivered_graph_bytes(self):
        links=[a for t,a in self.parsed.tags if t=='a' and 'download' in a]
        self.assertEqual(len(links),5)
        for link in links:
            raw=base64.b64decode(link['href'].split(',',1)[1],validate=True)
            self.assertEqual(raw,(self.root/'graphs'/link['download']).read_bytes())
    def test_embedded_images_match_delivered_maps_and_have_alt_text(self):
        images=[a for t,a in self.parsed.tags if t=='img']
        self.assertEqual(len(images),5)
        for name,image in zip(report.BOARDS,images):
            self.assertTrue(image['alt'])
            raw=base64.b64decode(image['src'].split(',',1)[1],validate=True)
            self.assertEqual(raw,(self.root/'drafts'/f'{name}.png').read_bytes())
    def test_repeated_build_is_identical(self):
        self.assertEqual(report.render_report(self.root),self.rendered)
        p=report.build_report(self.root)
        self.assertEqual(p.read_text(encoding='utf-8'),self.rendered)
    def test_refuses_invented_costs(self):
        with self.graph() as (p,d):
            d['cells'][0]['acquisition_cost']=1;self.write(p,d)
            with self.assertRaisesRegex(ValueError,'price|digest|Artifact size mismatch'):report.render_report(self.root)
    def test_refuses_fabricated_optimum(self):
        with self.graph() as (p,d):
            d['optimal_path']=['r06c06'];self.write(p,d)
            with self.assertRaisesRegex(ValueError,'observation-only|digest|Artifact size mismatch'):report.render_report(self.root)
    def test_stale_inputs_do_not_replace_existing_report(self):
        output=self.root/'REPORT.html';output.write_text('preserved',encoding='utf-8')
        with self.graph() as (p,d):
            d['input_sha256']['calibration.json']='0'*64;self.write(p,d)
            with self.assertRaisesRegex(ValueError,'stale|digest|Artifact size mismatch'):report.build_report(self.root)
        self.assertEqual(output.read_text(encoding='utf-8'),'preserved')

if __name__=='__main__':unittest.main()
