"""Compare real five-board rendering with explicitly verified unchanged reuse."""
from pathlib import Path
import importlib.util,sys,time,json,statistics,tempfile,shutil,hashlib,platform
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('measured_builder',ROOT/'tools/build_outputs.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
TOOLBOX=ROOT.parents[2]/'heaven-toolbox/tools/graph-reconstruction'

def run():
    with tempfile.TemporaryDirectory(prefix='measured-build-') as directory:
        root=Path(directory)/'data';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('__pycache__'))
        full=[];cached=[]
        for _ in range(2):
            start=time.perf_counter();builder.run(root,TOOLBOX);full.append(time.perf_counter()-start);print("render seconds",full[-1],file=sys.stderr,flush=True)
        snapshot=builder.generation_snapshot(root,TOOLBOX)
        expected={k:v for k,v in snapshot['expected'].items() if k in builder.expected_outputs() or k==builder.RECEIPT}
        original_render=builder.render
        def reject_render(*args,**kwargs):raise AssertionError('Verified reuse must not render')
        builder.render=reject_render
        for _ in range(3):
            start=time.perf_counter();result=builder.run(root,TOOLBOX,reuse_verified=True);cached.append(time.perf_counter()-start)
            for rel,digest in expected.items():
                if hashlib.sha256((root/rel).read_bytes()).hexdigest()!=digest:raise AssertionError('Cache changed output')
        builder.render=original_render
        return {'schema':'aion2/daevanion-reuse-benchmark/v1','environment':{'python':platform.python_version(),'platform':platform.platform()},
            'full_render_seconds':full,'verified_reuse_seconds':cached,'full_median_seconds':statistics.median(full),
            'reuse_median_seconds':statistics.median(cached),'median_speedup':statistics.median(full)/statistics.median(cached),
            'checked_output_files_including_receipt':len(expected),'outputs_unchanged':True,
            'producer':snapshot['producer'],'limits':['Two full-render and three verified-reuse samples; indicative only, not a statistical confidence interval.',
            'Same-process warmed local filesystem; not an end-user latency guarantee.',
            'Reuse still validates evidence, source identity and every required input/output digest. Unknown game costs stay unknown.']}
if __name__=='__main__':print(json.dumps(run(),indent=2,sort_keys=True))
