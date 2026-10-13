"""Create a self-contained, script-free report from the checked board outputs."""
from pathlib import Path
from html import escape
import argparse
import base64
import hashlib
import json
import os
import tempfile
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from generation_evidence import generation_snapshot, recheck_snapshot, load_helpers

BOARDS=('Nezekan','Zikel','Vaizel','Triniel','Azphel')


def render_report(root=ROOT, _snapshot=None):
    root=Path(root)
    snapshot=_snapshot or generation_snapshot(root)
    safe, evidence, _ = load_helpers()
    sections=[]; totals={'positions':0,'nodes':0,'absent':0}
    for name in BOARDS:
        raw=snapshot['contents'][f'graphs/{name}.json']
        graph=safe.strict_json_loads(raw)
        if graph.get('board') != name:
            raise ValueError('Graph board identity mismatch')
        if (graph.get('adjacency_status')!='unverified' or graph.get('weights_status')!='unknown'
                or graph.get('verified_edges')!=[] or graph.get('optimal_path') is not None):
            raise ValueError('This report supports observation-only datasets, not verified routes')
        rows=graph['grid']['rows']; cols=graph['grid']['columns']; cells=graph['cells']
        if type(rows) is not int or type(cols) is not int or rows<1 or cols<1 or len(cells)!=rows*cols:
            raise ValueError('Graph coverage mismatch')
        evidence.validate_grid(rows,cols,cells,graph['grid']['source_size'])
        coords={(cell['row'],cell['column']) for cell in cells}
        if coords!={(r,c) for r in range(1,rows+1) for c in range(1,cols+1)}:
            raise ValueError('Duplicate or missing graph coordinates')
        nodes=sum(cell['occupied'] is True for cell in cells)
        if (nodes!=len(graph['nodes']) or nodes!=graph['validation']['visible_nodes']
                or set(graph['nodes'])!={c['id'] for c in cells if c['occupied'] is True}):
            raise ValueError('Graph node count mismatch')
        if any(node.get('acquisition_cost') is not None for node in cells):
            raise ValueError('Unexpected price in observation-only dataset')
        for rel,digest in graph['input_sha256'].items():
            parts=Path(rel).parts
            if Path(rel).is_absolute() or '..' in parts or '\\' in rel:
                raise ValueError('Unsafe source reference')
            if hashlib.sha256(snapshot['contents'][rel]).hexdigest()!=digest:
                raise ValueError('Graph is stale relative to its recorded input')
        # A consistent checksum record is not a schema oracle. Reconcile the
        # exported observations against their actual source-bound pass and evidence.
        from build_outputs import SYMBOL, CLASSES
        calibration=safe.strict_json_loads(snapshot['contents']['calibration.json'])[name]
        visual=safe.strict_json_loads(snapshot['contents']['transcriptions/pass-a.json'])['boards'][name]
        pixel=safe.strict_json_loads(snapshot['contents']['transcriptions/pass-b.json'])['boards'][name]
        rec=safe.strict_json_loads(snapshot['contents'][f'evidence/{name}-reconciliation.json'])
        proof=evidence.validate_reconciliation(rows=rows,columns=cols,
            visual_grid=visual,pixel_grid=pixel,records=rec['cells'],trial_grids=rec['trial_grids'])
        expected_refs={rel:digest for rel,digest in snapshot['receipt']['input_sha256'].items()
            if rel in ('calibration.json','transcriptions/pass-a.json','transcriptions/pass-b.json',
                       'evidence/perturbation-design.json',f'evidence/{name}-reconciliation.json',
                       f'originals/{name}.png',f'enhanced/{name}.png')}
        if graph['grid']!=calibration or graph['input_sha256']!=expected_refs:
            raise ValueError('Graph source identity or coverage mismatch')
        starts=[]
        for cell in cells:
            r,c=cell['row'],cell['column'];token=visual[r-1][c-1]
            expected={'id':f'r{r:02}c{c:02}','occupied':token!='.',
                'visual_token':token,'symbol':SYMBOL[token],'visual_class':CLASSES[token],
                'gold_lit':token in 'YBGO','acquisition_state':'unknown',
                'center_px':[calibration['x0']+(c-1)*calibration['dx'],calibration['y0']+(r-1)*calibration['dy']]}
            if any(type(cell.get(k)) is not type(v) or cell[k]!=v for k,v in expected.items()):
                raise ValueError('Graph cell contradicts source transcription')
            for key,value in proof[(r,c)].items():
                got=cell.get('evidence',{}).get(key)
                if type(got) is not type(value) or got!=value:
                    raise ValueError('Graph evidence contradicts observations')
            if token=='S':starts.append(cell['id'])
        if len(starts)!=1 or graph['start']!=starts[0]:
            raise ValueError('Graph start mismatch')
        png=base64.b64encode(snapshot['contents'][f'drafts/{name}.png']).decode('ascii')
        data=base64.b64encode(raw).decode('ascii')
        text=snapshot['contents'][f'drafts/{name}.txt'].decode('utf-8')
        digest=hashlib.sha256(raw).hexdigest()
        totals['positions']+=len(cells); totals['nodes']+=nodes; totals['absent']+=len(cells)-nodes
        sections.append(f'''<section id="{name}" aria-labelledby="heading-{name}">
<div class="section-heading"><div><p class="eyebrow">OBSERVED BOARD</p><h2 id="heading-{name}">{name}</h2></div>
<p class="board-count">{rows} × {cols}<br><span>{nodes} nodes · {len(cells)-nodes} absent</span></p></div>
<figure><img src="data:image/png;base64,{png}" alt="{name}: {rows} by {cols} labelled node map. Text equivalent is available below." loading="lazy"></figure>
<details><summary>Read the coordinate map as text</summary><pre>{escape(text)}</pre></details>
<p class="actions"><a download="{name}.json" href="data:application/json;base64,{data}">Save board JSON</a> <a href="#top">Back to overview ↑</a></p>
<p class="digest">Graph SHA-256: <code>{digest}</code></p>
</section>''')
    nav=''.join(f'<a href="#{name}">{name}</a>' for name in BOARDS)
    recheck_snapshot(root,snapshot)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Daevanion — Five-board reconstruction</title>
<style>
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:#f3f5f7;color:#172a3a;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:1100px;margin:auto;padding:28px 20px 60px}}header{{padding:28px 0}}h1{{font-size:clamp(30px,6vw,54px);line-height:1.08;margin:10px 0 20px;letter-spacing:-.035em}}h2{{font-size:32px;line-height:1.2;margin:0}}.eyebrow{{font-size:12px;font-weight:750;letter-spacing:.14em;color:#435e70;margin:0 0 8px}}.intro{{max-width:780px;font-size:18px}}.note{{border-left:4px solid #ad7b2b;padding:14px 18px;background:#fff4dd;max-width:850px}}.stats{{display:flex;flex-wrap:wrap;gap:16px;margin:26px 0}}.stat{{background:#fff;border:1px solid #d9e0e7;border-radius:12px;padding:18px 24px;flex:1;min-width:145px}}.stat strong{{display:block;font-size:36px;line-height:1.2}}.stat span{{font-size:14px;color:#435e70}}nav{{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}}a{{color:#18527b;text-decoration:underline;text-underline-offset:3px}}nav a{{text-decoration:none;border:1px solid #aabdc9;background:white;border-radius:24px;padding:8px 16px}}a:focus-visible,summary:focus-visible{{outline:3px solid #bd6414;outline-offset:3px}}section{{background:#fff;border:1px solid #d9e0e7;border-radius:16px;padding:28px;margin:24px 0;scroll-margin-top:20px}}.section-heading{{display:flex;justify-content:space-between;gap:16px;align-items:center}}.board-count{{font-size:22px;text-align:right;line-height:1.4}}.board-count span{{font-size:14px;color:#435e70}}figure{{margin:16px 0}}img{{display:block;width:100%;height:auto;border-radius:8px}}summary{{cursor:pointer;font-weight:650;padding:12px 0}}pre{{white-space:pre;overflow:auto;background:#f3f5f7;padding:16px;border-radius:8px;font-size:13px;line-height:1.6}}.actions{{display:flex;flex-wrap:wrap;gap:22px}}.digest{{font-size:12px;color:#435e70;overflow-wrap:anywhere}}footer{{color:#435e70;font-size:14px}}@media(max-width:500px){{main{{padding:12px}}section{{padding:14px}}.board-count{{font-size:18px}}h2{{font-size:27px}}.stat{{padding:14px}}}}@media print{{body{{background:white}}nav,.actions{{display:none}}section{{break-inside:avoid}}}}
</style></head><body><main id="top"><header>
<p class="eyebrow">AION 2 · SCREENSHOT-BOUND DATASET</p><h1>Daevanion<br>Five-board reconstruction</h1>
<p class="intro">Five supplied screenshots, preserved and reconstructed into labelled node maps. Each board keeps its own dimensions. Open a text map or save the machine-readable JSON below.</p>
<p class="note"><strong>Observation report, not a playable route optimizer.</strong> Unlock connections, acquisition prices and purchase state remain unverified. Gold lighting describes appearance, not proof of purchase. Repository publication is not claimed by this local report.</p>
<div class="stats"><div class="stat"><strong>{len(BOARDS)}</strong><span>boards</span></div><div class="stat"><strong>{totals['positions']}</strong><span>grid positions</span></div><div class="stat"><strong>{totals['nodes']}</strong><span>visible nodes, including starts</span></div><div class="stat"><strong>{totals['absent']}</strong><span>absent positions</span></div></div>
<nav aria-label="Choose board">{nav}</nav>
<p>Coordinates are one-based from the top-left. The maps represent the supplied screenshots, not a guarantee about every region or current game patch. Parameter stability is not an independent accuracy guarantee.</p>
</header>{''.join(sections)}
<footer><p>This file uses embedded images and data, no scripts, trackers, external fonts or network requests. Some mobile previewers restrict saving data links; the full package contains the same JSON files directly. Original screenshots, source overlays, reconciliation records, code and tests are in the accompanying source package.</p></footer></main></body></html>\n'''


def build_report(root=ROOT, output=None):
    root=Path(root); output=Path(output) if output is not None else root/'REPORT.html'
    snapshot=generation_snapshot(root)
    rendered=render_report(root,snapshot)
    output.parent.mkdir(parents=True,exist_ok=True)
    fd,temp=tempfile.mkstemp(prefix='.report-',suffix='.html',dir=output.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as f: f.write(rendered)
        recheck_snapshot(root,snapshot)
        os.replace(temp,output)
    finally:
        Path(temp).unlink(missing_ok=True)
    return output


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    try:
        print(build_report(args.root,args.output))
    except (ValueError,OSError,KeyError,TypeError) as e:
        parser.exit(2,f'Report not built: {e}\n')
