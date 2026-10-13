"""Bind this project's generated drafts to exact inputs and producer identity.

A receipt is an integrity record, NOT a signature, lease, domain-rule proof or
transactional writer lock. It is published last; readers reject mixed generations.
"""
from pathlib import Path
from hashlib import sha256
import sys
import os
from PIL import Image, __version__ as PIL_VERSION

ROOT=Path(__file__).resolve().parents[1]
DEFAULT_TOOLBOX=Path(os.environ.get('HEAVEN_TOOLBOX_GRAPH_ROOT',ROOT.parents[2]/'heaven-toolbox/tools/graph-reconstruction'))
BOARDS=('Nezekan','Zikel','Vaizel','Triniel','Azphel')
RECEIPT='evidence/generation-receipt.json'


def load_helpers(toolbox=DEFAULT_TOOLBOX):
    toolbox=Path(toolbox).resolve()
    if str(toolbox) not in sys.path:sys.path.insert(0,str(toolbox))
    import safe_artifacts, evidence_grid, artifact_manifest
    for module in (safe_artifacts,evidence_grid,artifact_manifest):
        if Path(module.__file__).resolve() != toolbox/(module.__name__+'.py'):
            raise ValueError('Toolbox module origin differs from the explicit source directory')
    return safe_artifacts,evidence_grid,artifact_manifest


def expected_outputs():
    paths={'evidence/board-summary.json'}
    for name in BOARDS:
        paths.update({f'graphs/{name}.json',f'overlays/{name}.png',
                      f'drafts/{name}.png',f'drafts/{name}.svg',
                      f'drafts/{name}.txt',f'drafts/{name}-geometric-candidates.png'})
    return paths


def expected_inputs():
    paths={'calibration.json','transcriptions/pass-a.json','transcriptions/pass-b.json',
           'evidence/perturbation-design.json'}
    for name in BOARDS:
        paths.update({f'evidence/{name}-reconciliation.json',f'originals/{name}.png',f'enhanced/{name}.png'})
    return paths


def producer_fingerprint(root,toolbox=DEFAULT_TOOLBOX):
    safe,_,_=load_helpers(toolbox)
    source={}
    for name in ('build_outputs.py','generation_evidence.py'):
        source[f'game-tools/{name}']=sha256(safe.read_artifact(root,f'tools/{name}')).hexdigest()
    for name in ('evidence_grid.py','safe_artifacts.py','artifact_manifest.py'):
        source[f'toolbox/{name}']=sha256(safe.read_artifact(toolbox,name)).hexdigest()
    fonts={}
    for name in ('DejaVuSans.ttf','DejaVuSansMono.ttf'):
        p=Path('/usr/share/fonts/truetype/dejavu')/name
        fonts[name]=sha256(p.read_bytes()).hexdigest() if p.is_file() else None
    return {'source_sha256':source,'pillow':PIL_VERSION,
            'freetype':getattr(Image.core,'freetype2_version',None),'fonts_sha256':fonts,
            'python':list(sys.version_info[:3])}


def make_receipt(staged,inputs,producer,toolbox=DEFAULT_TOOLBOX):
    safe,_,_=load_helpers(toolbox)
    files=[]
    for rel in sorted(expected_outputs()):
        raw=safe.read_artifact(staged,rel)
        files.append({'path':rel,'sha256':sha256(raw).hexdigest(),'bytes':len(raw)})
    return {'schema':'aion2/daevanion-generation/v1','boards':list(BOARDS),
            'input_sha256':dict(sorted(inputs.items())),'producer':producer,'files':files,
            'claim':'local-byte-consistency-only; not authentication or game mechanics'}


def generation_snapshot(root,toolbox=DEFAULT_TOOLBOX):
    safe,_,manifest=load_helpers(toolbox)
    raw=safe.read_artifact(root,RECEIPT)
    doc=safe.strict_json_loads(raw)
    if (not isinstance(doc,dict) or doc.get('schema')!='aion2/daevanion-generation/v1'
            or doc.get('boards')!=list(BOARDS)):
        raise ValueError('Generation receipt identity mismatch')
    manifest.verify_manifest(root,doc)
    if {f['path'] for f in doc['files']} != expected_outputs():
        raise ValueError('Generation receipt output coverage mismatch')
    inputs=doc.get('input_sha256')
    if not isinstance(inputs,dict) or set(inputs)!=expected_inputs():
        raise ValueError('Generation receipt input coverage mismatch')
    if doc.get('producer')!=producer_fingerprint(root,toolbox):
        raise ValueError('Generation producer changed; rebuild required')
    expected={f['path']:f['sha256'] for f in doc['files']}
    expected.update(inputs);expected[RECEIPT]=sha256(raw).hexdigest()
    contents={}
    for rel,digest in expected.items():
        data=safe.read_artifact(root,rel)
        if sha256(data).hexdigest()!=digest:
            raise ValueError('Stale or changed generation artifact: '+rel)
        contents[rel]=data
    return {'contents':contents,'expected':expected,'producer':doc['producer'],'receipt':doc}


def recheck_snapshot(root,snapshot,toolbox=DEFAULT_TOOLBOX):
    safe,_,_=load_helpers(toolbox)
    for rel,digest in snapshot['expected'].items():
        if sha256(safe.read_artifact(root,rel)).hexdigest()!=digest:
            raise ValueError('Generation changed during consumption')
    if snapshot['producer']!=producer_fingerprint(root,toolbox):
        raise ValueError('Producer changed during consumption')
