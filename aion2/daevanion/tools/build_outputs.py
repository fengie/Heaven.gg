"""Build game-only graph drafts from preserved, reconciled observations.

No inferred game edges, costs, acquisition state or optimum is promoted.
Optional geometric pairs are explicitly segregated hypotheses.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, sys, hashlib, html, os, argparse, tempfile
from io import BytesIO
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from generation_evidence import (load_helpers, expected_outputs, make_receipt,
    producer_fingerprint, generation_snapshot, recheck_snapshot, RECEIPT, BOARDS)

TOOLBOX=Path(os.environ.get('HEAVEN_TOOLBOX_GRAPH_ROOT',
    ROOT.parents[2]/'heaven-toolbox/tools/graph-reconstruction'))

FONT_PATH='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
MONO_PATH='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
def font(n,mono=False):
    try:return ImageFont.truetype(MONO_PATH if mono else FONT_PATH,n)
    except OSError:return ImageFont.load_default()
COLORS={'.':'#FFFFFF','x':'#CDD2D8','Y':'#EEC961','b':'#79B5DF','B':'#79B5DF','g':'#8DC6AC','G':'#8DC6AC','o':'#E9AD71','O':'#E9AD71','S':'#EDE7F7'}
SYMBOL={'x':'basic','Y':'basic','b':'blue','B':'blue','g':'green','G':'green','o':'orange','O':'orange','S':'start','.':None}
CLASSES={'x':'gray','Y':'gold','b':'blue','B':'blue','g':'green','G':'green','o':'orange','O':'orange','S':'start','.':'absent'}

def render(name,rows,out,geometric=False):
    nr=len(rows);nc=len(rows[0]);step=60;left=64;top=132
    w=max(800,left+nc*step+28);h=top+nr*step+126
    im=Image.new('RGB',(w,h),'#FAFBFD');d=ImageDraw.Draw(im)
    d.text((26,18),f'{name}  |  Daevanion',font=font(30),fill='#172A3A')
    n=sum(ch!='.' for row in rows for ch in row)
    d.text((28,59),f'{nr} x {nc} grid  |  {n} visible nodes  |  1-based row / column',font=font(17),fill='#334B60')
    d.text((28,86),'GEOMETRIC CANDIDATES ONLY - not verified unlocks' if geometric else 'OBSERVED NODE MAP - no unlock edges or costs asserted',font=font(16),fill='#334B60')
    for c in range(nc):d.text((left+c*step+step*.36,top-25),str(c+1),font=font(14,True),fill='#334B60')
    for r in range(nr):d.text((20,top+r*step+20),str(r+1),font=font(14,True),fill='#334B60')
    if geometric:
        for r,row in enumerate(rows):
            for c,ch in enumerate(row):
                if ch=='.':continue
                for dr,dc in [(1,0),(0,1)]:
                    if r+dr<nr and c+dc<nc and rows[r+dr][c+dc]!='.':
                        x=left+c*step+step/2;y=top+r*step+step/2
                        # Explicit dashed geometry, never an acquired route.
                        for t in range(0,60,9):
                            d.line((x+dc*t,y+dr*t,x+dc*min(t+5,60),y+dr*min(t+5,60)),fill='#758796',width=2)
    for r,row in enumerate(rows):
        for c,ch in enumerate(row):
            x=left+c*step;y=top+r*step
            if ch=='.':d.ellipse((x+28,y+28,x+31,y+31),fill='#BAC4CE');continue
            box=(x+8,y+6,x+52,y+52)
            d.rounded_rectangle(box,radius=7,fill=COLORS[ch],outline='#41566A',width=2)
            if ch in 'YBGO':d.rounded_rectangle((x+11,y+9,x+49,y+49),radius=5,outline='#916C21',width=1)
            d.text((x+22,y+11),ch,font=font(22,True),fill='#122637')
            d.text((x+11,y+37),f'{r+1:02},{c+1:02}',font=font(9,True),fill='#122637')
    foot=top+nr*step+16
    for i,text in enumerate([
        'x: gray   Y: gold basic   B/b: blue   G/g: green   O/o: orange   S: start',
        'Uppercase colored letters: gold-lit visual treatment; lowercase: dark.',
        'Gold lighting is an observation, not verified purchase/acquisition state.',
        'Costs: unknown. Orthogonal proximity is not proof of game adjacency.'
    ]):d.text((28,foot+i*22),text,font=font(13),fill='#334B60')
    im.save(out)
    # Deterministic accessible SVG with the same logical map, no raster source.
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
           f'<title>{name} observed board map</title>', '<desc>Symbols transcribed from the supplied screenshot. Numeric weights are unknown.</desc>',
           '<rect width="100%" height="100%" fill="#FAFBFD"/>',
           f'<text x="28" y="45" font-size="28" font-family="sans-serif">{name} — {nr} × {nc}, {n} visible nodes</text>',
           '<text x="28" y="80" font-size="16" font-family="sans-serif">Observed node positions; no game adjacency or costs asserted</text>']
    for r,row in enumerate(rows):
        for c,ch in enumerate(row):
            if ch=='.':continue
            x=left+c*step;y=top+r*step
            parts.append(f'<g><title>row {r+1}, column {c+1}, {CLASSES[ch]}</title><rect x="{x+7}" y="{y+6}" width="46" height="46" rx="6" fill="{COLORS[ch]}" stroke="#41566A"/><text x="{x+22}" y="{y+34}" font-family="monospace" font-size="22">{ch}</text><text x="{x+11}" y="{y+47}" font-family="monospace" font-size="9">{r+1:02},{c+1:02}</text></g>')
    parts.append('</svg>')
    if not geometric:out.with_suffix('.svg').write_text('\n'.join(parts)+'\n',encoding='utf-8',newline='\n')

def validate_inputs(root=ROOT, toolbox=TOOLBOX):
    """Validate every board before writing any output; keep uncertainty real."""
    root, toolbox = Path(root), Path(toolbox)
    if not (toolbox/'evidence_grid.py').is_file():
        raise ValueError('Toolbox graph library missing; pass its directory explicitly')
    safe, evidence, _ = load_helpers(toolbox)
    from evidence_grid import validate_reconciliation, canonical_json

    input_hashes={}
    def read_bytes(rel):
        raw=safe.read_artifact(root,rel)
        input_hashes[rel]=hashlib.sha256(raw).hexdigest()
        return raw
    def read_json(rel):
        return safe.strict_json_loads(read_bytes(rel))
    a=read_json('transcriptions/pass-a.json'); b=read_json('transcriptions/pass-b.json')
    cfg=read_json('calibration.json'); design=read_json('evidence/perturbation-design.json')
    if (not isinstance(a.get('boards'),dict) or not a['boards'] or
            not isinstance(b.get('boards'),dict) or set(a['boards']) != set(b['boards']) or
            set(a['boards']) != set(cfg) or set(cfg) != set(BOARDS)):
        raise ValueError('Visual, pixel and calibration board coverage mismatch')
    trials=design.get('trials')
    if (not isinstance(trials,list) or not trials or
            type(design.get('count_per_board')) is not int or
            design['count_per_board'] != len(trials)):
        raise ValueError('Sensitivity design count mismatch')
    if any(not isinstance(t,dict) or type(t.get('id')) is not int for t in trials):
        raise ValueError('Explicit trial identities required')
    if len({t['id'] for t in trials}) != len(trials):
        raise ValueError('Duplicate trial identity')
    signatures=[canonical_json({k:v for k,v in t.items() if k != 'id'}) for t in trials]
    if len(set(signatures)) != len(signatures):
        raise ValueError('Repeated trial design is not a distinct perturbation')
    prepared={}
    shared=('calibration.json','transcriptions/pass-a.json','transcriptions/pass-b.json',
            'evidence/perturbation-design.json')
    for name, rows in a['boards'].items():
        if not isinstance(name,str) or not name or any(ch not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for ch in name):
            raise ValueError('Unsafe board label')
        c=cfg[name]; rec_path=f'evidence/{name}-reconciliation.json'; rec=read_json(rec_path)
        if rec.get('board') != name:
            raise ValueError('Reconciliation board identity mismatch')
        if len(rec.get('trial_grids',[])) != len(trials):
            raise ValueError('Reconciliation/design trial coverage mismatch')
        observations=validate_reconciliation(rows=c['rows'], columns=c['columns'],
            visual_grid=rows, pixel_grid=b['boards'][name], records=rec.get('cells'),
            trial_grids=rec.get('trial_grids'))
        if any(token not in SYMBOL for row in rows for token in row):
            raise ValueError('Unknown transcription token')
        if sum(token == 'S' for row in rows for token in row) != 1:
            raise ValueError('Exactly one observed start required')
        mismatches=[r for r in rec['cells'] if not observations[(r['row'],r['column'])]['agreement']]
        unstable=[r for r in rec['cells'] if not observations[(r['row'],r['column'])]['all_variants_stable']]
        if rec.get('baseline_disagreements') != mismatches or rec.get('unstable_cells') != unstable:
            raise ValueError('Reconciliation summary contradicts its records')
        if mismatches:
            raise ValueError(f'Unresolved visual/pixel transcription: {name}')
        image=read_bytes(f'originals/{name}.png')
        if hashlib.sha256(image).hexdigest() != c.get('source_sha256'):
            raise ValueError(f'Original source digest mismatch: {name}')
        with Image.open(BytesIO(image)) as im:
            if list(im.size) != c.get('source_size'):
                raise ValueError(f'Original source dimensions mismatch: {name}')
        with Image.open(BytesIO(read_bytes(f'enhanced/{name}.png'))) as im:
            if list(im.size) != c['source_size']:
                raise ValueError(f'Enhanced review copy dimensions mismatch: {name}')
        # Source binding is local consistency, not a signature or game-mechanics proof.
        paths=(*shared,rec_path,f'originals/{name}.png',f'enhanced/{name}.png')
        hashes={rel:input_hashes[rel] for rel in paths}
        prepared[name]={'observations':observations,'hashes':hashes,'trial_count':len(trials)}
    return a,b,cfg,prepared


def run(root=ROOT, toolbox=TOOLBOX, check_only=False, reuse_verified=False):
    root=Path(root)
    a,b,cfg,prepared=validate_inputs(root,toolbox)
    from evidence_grid import canonical_json, validate_grid
    if check_only:
        return {'boards':len(prepared),'grid_positions':sum(len(p['observations']) for p in prepared.values())}
    safe, _, _ = load_helpers(toolbox)
    producer=producer_fingerprint(root,toolbox)
    if reuse_verified:
        try:
            snapshot=generation_snapshot(root,toolbox)
            recheck_snapshot(root,snapshot,toolbox)
            return safe.strict_json_loads(snapshot['contents']['evidence/board-summary.json'])
        except (ValueError, OSError, KeyError):
            pass  # Invalid cache is rebuilt, never accepted as successful evidence.
    summary=[]
    # Complete generation is staged; validation/render failures publish nothing.
    # Individual file replacement is atomic, but this is not a multi-file transaction.
    # The delivery manifest detects an interrupted publication.
    with tempfile.TemporaryDirectory(prefix='.generated-', dir=root) as temporary:
        dest=Path(temporary)
        for dirname in ('graphs','drafts','overlays','evidence'):
            (dest/dirname).mkdir()
        for name,rows in a['boards'].items():
            c=cfg[name]; cells=[]; nodes=[]; proof=prepared[name]
            for r,row in enumerate(rows):
                for col,ch in enumerate(row):
                    observed=proof['observations'][(r+1,col+1)]
                    item={'row':r+1,'column':col+1,'id':f'r{r+1:02}c{col+1:02}',
                          'center_px':[c['x0']+col*c['dx'],c['y0']+r*c['dy']],
                          'occupied':ch!='.','symbol':SYMBOL[ch],'visual_class':CLASSES[ch],
                          'visual_token':ch,'gold_lit':ch in 'YBGO','acquisition_state':'unknown',
                          'acquisition_cost':None,
                          'evidence':{'visual_pass':'pass-a','pixel_pass':'pass-b',
                                      **observed,'independent_human_review':False}}
                    if name=='Triniel' and r==12 and ch!='.':
                        item['visible_limit']='lower tile border clipped by original screenshot; glyph visible'
                    cells.append(item)
                    if ch!='.':nodes.append(item['id'])
            validate_grid(c['rows'],c['columns'],cells,c['source_size'])
            occupied={(z['row'],z['column']):z['id'] for z in cells if z['occupied']};pairs=[]
            for (r,col),uid in occupied.items():
                for dr,dc in [(0,1),(1,0)]:
                    if (r+dr,col+dc) in occupied:
                        pairs.append({'u':uid,'v':occupied[(r+dr,col+dc)],'grid_delta':[dr,dc],
                                      'geometric_separation_cells':1,'weight':None,
                                      'game_adjacency_status':'unverified_geometric_candidate'})
            graph={'schema':'aion2/daevanion-observation-graph/v2','board':name,
                   'grid':c,'coordinates':'row and column start at 1, top-left',
                   'nodes':nodes,'cells':cells,'start':[z['id'] for z in cells if z['symbol']=='start'][0],
                   'adjacency_status':'unverified','weights_status':'unknown','verified_edges':[],
                   'geometric_neighbor_candidates':pairs,'optimal_path':None,
                   'input_sha256':proof['hashes'],
                   'validation':{'total_grid_positions':len(cells),'visible_nodes':len(nodes),
                                 'visual_pixel_disagreements':sum(not z['evidence']['agreement'] for z in cells),
                                 'sensitivity_runs':proof['trial_count'],
                                 'sensitivity_unstable_cells':sum(not z['evidence']['all_variants_stable'] for z in cells),
                                 'statistically_independent_reconstructions':False},
                   'uncertainty':['Gold highlighting may indicate UI state; no acquisition semantics inferred.',
                                  'Node effect, per-node crystal cost and unlock prerequisites require game evidence.',
                                  'Proximity pairs are segregated hypotheses, not playable connections.',
                                  'No independently labelled holdout screenshots or human audit yet.']}
            (dest/'graphs'/f'{name}.json').write_text(canonical_json(graph),encoding='utf-8',newline='\n')
            lines=[f'{name} | {c["rows"]}x{c["columns"]} | {len(nodes)} visible nodes',
                   'Legend: .=absent x=gray Y=gold B/b=blue G/g=green O/o=orange S=start',
                   'Uppercase colored tokens are gold-lit. Acquisition state and costs unknown.',
                   '    '+' '.join(f'{j+1:02}' for j in range(c['columns']))]
            lines += [f'{i+1:02}  '+'  '.join(row) for i,row in enumerate(rows)]
            (dest/'drafts'/f'{name}.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8',newline='\n')
            render(name,rows,dest/'drafts'/f'{name}.png')
            render(name,rows,dest/'drafts'/f'{name}-geometric-candidates.png',True)
            with Image.open(root/'enhanced'/f'{name}.png') as source:
                im=source.convert('RGB')
            draw=ImageDraw.Draw(im)
            for z in cells:
                if not z['occupied']:continue
                x,y=z['center_px'];rad=round(min(c['dx'],c['dy'])*.42)
                draw.rectangle((x-rad,y-rad,x+rad,y+rad),outline='#F8FBFF',width=1)
                label=f'{z["row"]:02},{z["column"]:02} {z["visual_token"]}'
                draw.rectangle((x-rad,y-rad,x-rad+57,y-rad+13),fill='#172A3A')
                draw.text((x-rad+1,y-rad),label,font=font(10,True),fill='#FFFFFF')
            im.save(dest/'overlays'/f'{name}.png')
            summary.append({'board':name,'rows':c['rows'],'columns':c['columns'],
                            'grid_positions':len(cells),'visible_nodes':len(nodes),
                            'absent':len(cells)-len(nodes),'start':graph['start'],
                            'geometric_pairs':len(pairs),'verified_game_edges':0,'known_node_costs':0})
        (dest/'evidence/board-summary.json').write_text(canonical_json(summary),encoding='utf-8',newline='\n')
        # Detect ordinary input edits during rendering before replacing any output.
        for proof in prepared.values():
            for rel,digest in proof['hashes'].items():
                if hashlib.sha256(safe.read_artifact(root,rel)).hexdigest() != digest:
                    raise ValueError('Input changed during build; generated outputs not published')
        if producer != producer_fingerprint(root,toolbox):
            raise ValueError('Producer changed during build')
        inputs={rel:digest for proof in prepared.values() for rel,digest in proof['hashes'].items()}
        receipt=make_receipt(dest,inputs,producer,toolbox)
        # Static output-directory symlinks are refused before the first replacement.
        for rel in expected_outputs() | {RECEIPT}:
            safe.artifact_path(root,rel)
        for staged in sorted(dest.rglob('*')):
            if staged.is_file():
                target=root/staged.relative_to(dest)
                target.parent.mkdir(parents=True,exist_ok=True)
                os.replace(staged,target)
        # Publish the marker last. An interruption leaves a detectable stale set.
        marker=dest/'generation-receipt.json'
        marker.write_text(canonical_json(receipt),encoding='utf-8',newline='\n')
        os.replace(marker,safe.artifact_path(root,RECEIPT))
    return summary


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('toolbox',nargs='?',type=Path,default=TOOLBOX,
                        help='Toolbox tools/graph-reconstruction directory')
    parser.add_argument('--root',type=Path,default=ROOT,help='Daevanion data directory')
    parser.add_argument('--check',action='store_true',help='Validate input evidence without writing')
    parser.add_argument('--reuse-verified',action='store_true',help='Skip rendering only when exact input, producer and output receipts still match')
    args=parser.parse_args()
    try:
        result=run(args.root,args.toolbox,args.check,args.reuse_verified)
    except (ValueError,KeyError,OSError) as error:
        parser.exit(2,f'Build refused: {error}\n')
    print(json.dumps(result,sort_keys=True,indent=2))
