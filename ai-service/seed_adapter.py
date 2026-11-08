"""Pinned upstream adapter: real inference.load_models(args) + inference.main(args).

No pitch-shift fallback. V1 timbre-only pipeline preserves length_adjust=1.0.
Only one caller is allowed by the API lock. Upstream's loader is cached once.
"""
import importlib,os,sys,threading,json,hashlib
from pathlib import Path
from types import SimpleNamespace
from typing import Protocol

ROOT=Path(__file__).resolve().parent
UPSTREAM_COMMIT='51383efd921027683c89e5348211d93ff12ac2a8'

class VoiceModel(Protocol):
    ready:bool
    error:str|None
    def load(self)->None:...
    def convert(self,source:Path,reference:Path,output:Path)->Path:...

class SeedVCAdapter:
    def __init__(self):
        self.ready=False;self.loading=False;self.error=None;self.device='unavailable';self.module=None;self.models=None
        self.source=Path(os.environ.get('SEED_VC_DIR',str(ROOT/'vendor'/'seed-vc'))).resolve()
        self.runtime=Path(os.environ.get('SEED_RUNTIME',str(ROOT.parent/'.runtime'/'seed'))).resolve();self.runtime.mkdir(parents=True,exist_ok=True)
        self.steps=int(os.environ.get('SEED_DIFFUSION_STEPS','30'));self.guidance=float(os.environ.get('SEED_GUIDANCE_RATE','.7'))
        self.auto_download=os.environ.get('SEED_AUTO_DOWNLOAD','0')=='1'
        for key,folder in [('MPLCONFIGDIR','matplotlib'),('NUMBA_CACHE_DIR','numba'),('CUDA_CACHE_PATH','cuda-cache'),('IPYTHONDIR','ipython')]:
            directory=ROOT.parent/'.runtime'/folder;directory.mkdir(parents=True,exist_ok=True);os.environ.setdefault(key,str(directory))
    def args(self):
        return SimpleNamespace(f0_condition=False,auto_f0_adjust=False,semi_tone_shift=0,fp16=self.device=='cuda',checkpoint=os.environ.get('SEED_CHECKPOINT') or None,config=os.environ.get('SEED_CONFIG') or None,diffusion_steps=self.steps,length_adjust=1.0,inference_cfg_rate=self.guidance)
    def load(self):
        if self.ready or self.loading:return
        self.loading=True
        try:
            if not (self.source/'inference.py').is_file():raise RuntimeError('缺少Seed-VC源码；先运行scripts/install-model.ps1。')
            manifest=json.loads((ROOT/'source-manifest.json').read_text())
            for name,expected in manifest['files'].items():
                path=self.source/name
                if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise RuntimeError('Seed-VC源码与已核验提交不一致：'+name)
            if not 1<=self.steps<=100:raise RuntimeError('SEED_DIFFUSION_STEPS必须在1至100之间。')
            os.environ.setdefault('HF_HOME',str(ROOT.parent/'.runtime'/'huggingface'))
            os.environ.setdefault('TORCH_HOME',str(ROOT.parent/'.runtime'/'torch'))
            from model_assets import ensure_assets
            ensure_assets(self.runtime,self.source,self.auto_download)
            # Exact, verified snapshots are now present. The upstream loader runs offline.
            os.environ['HF_HUB_OFFLINE']='1'
            os.environ['TRANSFORMERS_OFFLINE']='1'
            import torch
            requested=os.environ.get('SEED_DEVICE','auto')
            self.device=('cuda' if torch.cuda.is_available() else 'cpu') if requested=='auto' else requested
            if self.device not in ['cpu','cuda']:raise RuntimeError('此适配器支持cpu或cuda。')
            if self.device=='cuda' and not torch.cuda.is_available():raise RuntimeError('配置了CUDA，但当前PyTorch无法使用GPU。')
            # Upstream uses ./checkpoints. Keep its cwd in an ignored, private runtime.
            os.chdir(self.runtime);sys.path.insert(0,str(self.source))
            self.module=importlib.import_module('inference');self.module.device=torch.device(self.device)
            self.models=self.module.load_models(self.args())
            # main() calls the real loader on every request; reuse the already-loaded tuple.
            self.module.load_models=lambda _args:self.models
            self.ready=True;self.error=None
        except Exception as error:
            self.error=f'{type(error).__name__}: {str(error)[:700]}'
            print('Seed-VC load failed: '+self.error,flush=True)
        finally:self.loading=False
    def convert(self,source:Path,reference:Path,output:Path):
        if not self.ready:raise RuntimeError(self.error or 'Seed-VC模型尚未就绪。')
        args=self.args();args.source=str(source);args.target=str(reference);args.output=str(output)
        output.mkdir(parents=True,exist_ok=True);self.module.main(args)
        candidates=list(output.glob('vc_*.wav'))
        if len(candidates)!=1 or candidates[0].stat().st_size<44:raise RuntimeError('Seed-VC未生成有效结果音频。')
        return candidates[0]
    def status(self):return {'ready':self.ready,'loading':self.loading,'error':self.error,'device':self.device,'engine':'Seed-VC V1','commit':UPSTREAM_COMMIT,'autoDownload':self.auto_download}
