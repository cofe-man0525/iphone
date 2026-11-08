"""Range downloader for official PyTorch Windows wheels, with upstream SHA-256.
Avoids stalled full-file responses from a CDN; supports restarting completed ranges.
"""
import concurrent.futures,hashlib,html,json,os,re,threading,time
from pathlib import Path
import httpx
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'.runtime'/'wheels';OUT.mkdir(parents=True,exist_ok=True)
def download(package,version):
    index=httpx.get(f'https://download.pytorch.org/whl/cu121/{package}/',timeout=30,trust_env=False).text
    links=[html.unescape(x) for x in re.findall(r'href="([^"]+)"',index)]
    selected=next(x for x in links if f'{version}%2Bcu121-cp311-cp311-win_amd64.whl' in x)
    url,expected=selected.split('#sha256=');url=url.replace('download-r2.pytorch.org','download.pytorch.org')
    if url.startswith('/'):url='https://download.pytorch.org'+url
    name=url.rsplit('/',1)[1].replace('%2B','+');target=OUT/name
    if target.exists() and hashlib.file_digest(target.open('rb'),'sha256').hexdigest()==expected:return target
    print('Downloading from official URL: '+url,flush=True)
    with httpx.stream('GET',url,headers={'Range':'bytes=0-65535'},timeout=20,follow_redirects=True,trust_env=False) as response:
        response.raise_for_status();size=int(response.headers['content-range'].split('/')[-1])
    partial=target.with_suffix('.partial');progress=target.with_suffix('.ranges.json');chunk=8*1024*1024
    count=(size+chunk-1)//chunk;done=set(json.loads(progress.read_text()) if progress.exists() and partial.exists() else [])
    if not partial.exists():
        with partial.open('wb') as output:output.truncate(size)
    lock=threading.Lock();started=time.time()
    def part(number):
        start=number*chunk;end=min(size-1,start+chunk-1)
        for attempt in range(4):
            try:
                with httpx.stream('GET',url,headers={'Range':f'bytes={start}-{end}'},timeout=30,follow_redirects=True,trust_env=False) as response:
                    response.raise_for_status()
                    if response.status_code!=206:raise ValueError('CDN did not honor range request')
                    length=0
                    with partial.open('r+b') as output:
                        output.seek(start)
                        for data in response.iter_bytes():output.write(data);length+=len(data)
                    if length!=end-start+1:raise ValueError('incomplete range')
                with lock:
                    done.add(number);progress.write_text(json.dumps(sorted(done)))
                    if len(done)%8==0 or len(done)==count:print(f'{package}: {len(done)}/{count} ranges; {time.time()-started:.0f}s',flush=True)
                return
            except Exception:
                if attempt==3:raise
                time.sleep(1)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(part,[n for n in range(count) if n not in done]))
    with partial.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
    if actual!=expected:raise ValueError('Official wheel SHA-256 mismatch')
    partial.rename(target);progress.unlink(missing_ok=True)
    (target.with_suffix('.sha256')).write_text(expected+'  '+name+'\n')
    print(f'Verified {name}: {expected}',flush=True);return target
if __name__=='__main__':
    download('torch','2.4.1');download('torchaudio','2.4.1')
