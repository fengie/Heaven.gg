"""Image-specific classification and perturbation checks, not game mechanics.

Calibration: three smaller boards. Two larger boards are held out from the
feature threshold selection. Agreement on the calibration images is NOT an
unbiased accuracy estimate. Perturbations are correlated sensitivity checks.
"""
from pathlib import Path
import json,sys,random
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
TOOLBOX=ROOT.parents[2]/'heaven-toolbox/tools/graph-reconstruction'
# Optional explicit path makes the two packages usable as independent checkouts.
if len(sys.argv)>1:TOOLBOX=Path(sys.argv[1])
sys.path.insert(0,str(TOOLBOX))
from pixel_features import measure_tile
from evidence_grid import canonical_json

def classify(f,gain=1.,residual_threshold=3.,chroma_threshold=.06,highlight_threshold=120.):
    if f['plane_residual'] < residual_threshold*gain:return '.'
    if f['plane_residual']>48*gain and f['p95']>200*gain and f['blue_fraction']>.18:return 'S'
    for name,ch in [('blue_fraction','b'),('green_fraction','g'),('orange_fraction','o')]:
        if f[name]>chroma_threshold:return ch.upper() if f['p95']>highlight_threshold*gain else ch
    return 'Y' if f['p95']>highlight_threshold*gain else 'x'

def run():
    cfg=json.loads((ROOT/'calibration.json').read_text())
    a=json.loads((ROOT/'transcriptions/pass-a.json').read_text())
    trials=[]
    # Fully specified deterministic design. 20 genuinely different parameter
    # sets per image, not 20 claims of independent observers or extra images.
    for i in range(20):
        trials.append({'id':i+1,'offset':[(i%3)-1,((i//3)%3)-1],
                       'radius':[.30,.31,.32,.33][i%4],
                       'gain':[.85,1.,1.15,1.3,1.45][i%5],
                       'residual_threshold':[2.,3.,4.,5.][i%4],
                       'chroma_threshold':[.04,.05,.06,.07,.08][i%5],
                       'highlight_threshold':[110.,115.,120.,125.][i%4]})
    (ROOT/'evidence/perturbation-design.json').write_text(canonical_json({
        'count_per_board':20,'effective_independent_observers':0,
        'purpose':'sensitivity, not ground truth or binomial confidence', 'trials':trials}))
    pass_b={};summaries=[]
    for name,rows in a['boards'].items():
        im=Image.open(ROOT/'originals'/f'{name}.png').convert('RGB');c=cfg[name]
        records=[];brows=['' for _ in rows];run_grids=[['' for _ in rows] for t in trials]
        # Reverse traversal differs from visual row-major reading; no label
        # from pass A is consulted by the classifier.
        for r in reversed(range(c['rows'])):
            for col in reversed(range(c['columns'])):
                x=c['x0']+col*c['dx'];y=c['y0']+r*c['dy']
                f=measure_tile(im,x,y,c['dx'],radius=.32)
                label=classify(f);brows[r]=label+brows[r];labels=[]
                for i,t in enumerate(trials):
                    f2=measure_tile(im,x,y,c['dx'],offset=t['offset'],radius=t['radius'],gain=t['gain'])
                    lab=classify(f2,t['gain'],t['residual_threshold'],t['chroma_threshold'],t['highlight_threshold'])
                    run_grids[i][r]=lab+run_grids[i][r];labels.append(lab)
                records.append({'row':r+1,'column':col+1,'visual_a':rows[r][col],
                                'pixel_b':label,'agree':rows[r][col]==label,
                                'features':f,'sensitivity_labels':labels,
                                'sensitivity_agreement_with_a':labels.count(rows[r][col]),
                                'all_variants_stable':len(set(labels))==1})
        records.sort(key=lambda z:(z['row'],z['column']))
        pass_b[name]=brows
        mismatches=[z for z in records if not z['agree']]
        uncertain=[z for z in records if not z['all_variants_stable']]
        out={'board':name,'cells':records,'baseline_disagreements':mismatches,
             'unstable_cells':uncertain,'trial_grids':run_grids,
             'limitations':['Same pixels and same assistant; not independent human annotation.',
                            'Classifier calibrated on the three smaller boards.',
                            'Stability is not probability of correctness.']}
        (ROOT/'evidence'/f'{name}-reconciliation.json').write_text(canonical_json(out))
        summary={'board':name,'cells':len(records),'occupied_a':sum(ch!='.' for row in rows for ch in row),
                 'baseline_disagreements':len(mismatches),'unstable_cells':len(uncertain),'sensitivity_runs':20}
        summaries.append(summary);print(summary)
        for z in mismatches:print('  mismatch',z['row'],z['column'],z['visual_a'],z['pixel_b'])
    (ROOT/'transcriptions/pass-b.json').write_text(canonical_json({'method':'pixel features, reverse traversal',
        'blinded_to_cell_labels_in_code':True,'independent_observer':False,'boards':pass_b}))
    (ROOT/'evidence/reconciliation-summary.json').write_text(canonical_json(summaries))
if __name__=='__main__':run()
