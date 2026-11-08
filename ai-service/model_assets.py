"""Download fixed V1 assets; verify real bytes before PyTorch unpickles weights.

hf-mirror.com is the network fallback recommended by the pinned upstream README.
Weight hashes below are checked against official HF file pages or pinned upstream Git.
"""
import concurrent.futures,hashlib,json,os,threading,time
from pathlib import Path
import httpx

ASSETS=[
 ('Plachta/Seed-VC','257283f9f41585055e8f858fba4fd044e5caed6e','checkpoints',[
  ('DiT_seed_v2_uvit_whisper_small_wavenet_bigvgan_pruned.pth','8ec8841b20bb46df9f7e8e570a6946a4b87b940133c7f0e778487ff33841f720'),
  ('config_dit_mel_seed_uvit_whisper_small_wavenet.yml',None)]),
 ('funasr/campplus','e4b6ede7ce16997aff4ae69fbca1f0175e2afede','checkpoints',[
  ('campplus_cn_common.bin','3388cf5fd3493c9ac9c69851d8e7a8badcfb4f3dc631020c4961371646d5ada8')]),
 ('nvidia/bigvgan_v2_22khz_80band_256x','633ff708ed5b74903e86ff1298cf4a98e921c513','checkpoints/hf_cache',[
  ('config.json',None),('bigvgan_generator.pt','e95ba25972d3de0628d99cd156e9315a9c018899bf739988959ebe3544080ced')]),
 ('openai/whisper-small','973afd24965f72e36ca33b3055d56a652f456b4d','checkpoints/hf_cache',[
  ('config.json',None),('preprocessor_config.json',None),('model.safetensors','1d7734884874f1a1513ed9aa760a4f8e97aaa02fd6d93a3a85d27b2ae9ca596b')]),
]

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def ranged(url,target,expected):
    direct=os.environ.get('SEED_NO_ENV_PROXY','0')=='1';options={'timeout':30,'follow_redirects':True,'trust_env':not direct}
    with httpx.stream('GET',url,headers={'Range':'bytes=0-65535'},**options) as response:
        response.raise_for_status();size=int(response.headers['content-range'].split('/')[-1])
    partial=target.with_suffix(target.suffix+'.partial');state=target.with_suffix(target.suffix+'.ranges.json');chunk=8*1024*1024;count=(size+chunk-1)//chunk
    done=set(json.loads(state.read_text()) if state.exists() and partial.exists() else [])
    if not partial.exists():
        with partial.open('wb') as output:output.truncate(size)
    lock=threading.Lock();started=time.time()
    def part(number):
        start=number*chunk;end=min(start+chunk-1,size-1)
        for attempt in range(4):
            try:
                with httpx.stream('GET',url,headers={'Range':f'bytes={start}-{end}'},**options) as response:
                    response.raise_for_status()
                    if response.status_code!=206:raise RuntimeError('Server did not honor byte range')
                    length=0
                    with partial.open('r+b') as output:
                        output.seek(start)
                        for value in response.iter_bytes():length+=len(value);output.write(value)
                    if length!=end-start+1:raise RuntimeError('Incomplete model range')
                with lock:
                    done.add(number);state.write_text(json.dumps(sorted(done)))
                    if len(done)%8==0 or len(done)==count:print(f'{target.name}: {len(done)}/{count} ranges, {time.time()-started:.0f}s',flush=True)
                return
            except Exception:
                if attempt==3:raise
                time.sleep(1)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(part,[n for n in range(count) if n not in done]))
    if digest(partial)!=expected:raise RuntimeError('模型SHA256不匹配，拒绝加载：'+target.name)
    partial.replace(target);state.unlink(missing_ok=True)

def ensure_assets(runtime:Path,source:Path,download:bool):
    endpoint=os.environ.get('HF_ENDPOINT','https://huggingface.co').rstrip('/')
    verified=[]
    for repo,revision,cache,files in ASSETS:
        base=runtime/cache/('models--'+repo.replace('/','--'));snapshot=base/'snapshots'/revision;snapshot.mkdir(parents=True,exist_ok=True)
        for filename,expected in files:
            target=snapshot/filename
            if not target.is_file() or (expected and digest(target)!=expected):
                if repo=='funasr/campplus' and (source/filename).is_file() and digest(source/filename)==expected:
                    import shutil;shutil.copyfile(source/filename,target)
                elif not download:raise RuntimeError('缺少或校验失败的模型文件：'+repo+'/'+filename+'；请先运行安装脚本。')
                else:
                    url=f'{endpoint}/{repo}/resolve/{revision}/{filename}'
                    print('Downloading '+repo+'/'+filename,flush=True)
                    if expected:ranged(url,target,expected)
                    else:
                        response=httpx.get(url,timeout=30,follow_redirects=True,trust_env=os.environ.get('SEED_NO_ENV_PROXY','0')!='1');response.raise_for_status()
                        if response.content.lstrip().startswith(b'<'):raise RuntimeError('下载返回了网页而非模型配置。')
                        target.write_bytes(response.content)
            verified.append({'repo':repo,'revision':revision,'file':filename,'sha256':digest(target),'expected':expected})
        (base/'refs').mkdir(exist_ok=True);(base/'refs'/'main').write_text(revision)
    (runtime/'asset-verification.json').write_text(json.dumps(verified,indent=2),encoding='utf-8')
    return verified

if __name__=='__main__':
    root=Path(__file__).resolve().parent
    ensure_assets(Path(os.environ.get('SEED_RUNTIME',str(root.parent/'.runtime'/'seed'))).resolve(),Path(os.environ.get('SEED_VC_DIR',str(root/'vendor'/'seed-vc'))).resolve(),True)
