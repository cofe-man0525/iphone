from __future__ import annotations
import os,secrets,shutil,tempfile,threading,asyncio,time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated,Literal

ROOT=Path(__file__).resolve().parent
DATA=Path(os.environ.get('AIVOICE_AI_DATA',str(ROOT/'data'))).resolve();DATA.mkdir(parents=True,exist_ok=True)
tempfile.tempdir=str(DATA)
from fastapi import Depends,FastAPI,File,Form,HTTPException,Request,UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from audio import AudioError,encode,normalize
from seed_adapter import SeedVCAdapter

TOKEN=os.environ.get('AIVOICE_AI_TOKEN','')
model=SeedVCAdapter();inference_lock=threading.Lock();LIMIT=20*1024*1024

@asynccontextmanager
async def lifespan(app):
    threading.Thread(target=model.load,name='seed-load',daemon=True).start()
    yield

app=FastAPI(title='AI Voice Changer · Private AI Service',version='1.0.0',lifespan=lifespan,docs_url=None,redoc_url=None)
class TemporaryFileResponse(FileResponse):
    def __init__(self,*args,temporary_directory:Path,**kwargs):
        self.temporary_directory=temporary_directory;super().__init__(*args,**kwargs)
    async def __call__(self,scope,receive,send):
        try:await super().__call__(scope,receive,send)
        finally:
            folder=self.temporary_directory.resolve()
            if folder.parent==DATA.resolve():await asyncio.to_thread(shutil.rmtree,folder,True)
def authorize(request:Request):
    if not TOKEN:raise HTTPException(503,{'code':'AI_TOKEN_NOT_CONFIGURED','message':'推理服务尚未配置内部Token。'})
    if not secrets.compare_digest(request.headers.get('Authorization',''),'Bearer '+TOKEN):raise HTTPException(401,{'code':'UNAUTHORIZED','message':'推理服务Token不正确。'})

def upload(file:UploadFile,target:Path):
    size=0
    with target.open('wb') as output:
        while chunk:=file.file.read(1024*1024):
            size+=len(chunk)
            if size>LIMIT:raise HTTPException(413,{'code':'FILE_TOO_LARGE','message':'音频文件不能超过20MB。'})
            output.write(chunk)
    file.file.close()
    if not size:raise AudioError('音频文件为空。')

@app.get('/internal/health',dependencies=[Depends(authorize)])
def health():return model.status()

@app.post('/internal/normalize',dependencies=[Depends(authorize)])
def normalize_audio(audio:Annotated[UploadFile,File()],kind:Annotated[Literal['source','reference'],Form()]='source'):
    folder=Path(tempfile.mkdtemp(prefix='normalize-',dir=DATA))
    try:
        upload(audio,folder/'input.bin');duration=normalize(folder/'input.bin',folder/'normalized.wav',kind)
        return TemporaryFileResponse(folder/'normalized.wav',temporary_directory=folder,media_type='audio/wav',filename='normalized.wav',headers={'X-Audio-Duration':str(duration)})
    except AudioError as error:
        shutil.rmtree(folder,ignore_errors=True);raise HTTPException(422,{'code':'INVALID_AUDIO','message':str(error)})
    except Exception:
        shutil.rmtree(folder,ignore_errors=True);raise

@app.post('/internal/convert',dependencies=[Depends(authorize)])
def convert(audio:Annotated[UploadFile,File()],reference:Annotated[UploadFile,File()],format:Annotated[Literal['m4a','wav'],Form()]='m4a'):
    if not model.ready:raise HTTPException(503,{'code':'MODEL_NOT_READY','message':'Seed-VC模型未就绪：'+(model.error or '正在加载权重。')})
    if not inference_lock.acquire(blocking=False):raise HTTPException(429,{'code':'AI_BUSY','message':'模型正在处理其他任务，请稍后重试。'})
    folder=Path(tempfile.mkdtemp(prefix='convert-',dir=DATA))
    try:
        upload(audio,folder/'source.bin');upload(reference,folder/'reference.bin')
        normalize(folder/'source.bin',folder/'source.wav');normalize(folder/'reference.bin',folder/'reference.wav','reference')
        generated=model.convert(folder/'source.wav',folder/'reference.wav',folder/'output')
        result=folder/('result.'+format);encode(generated,result,format)
        return TemporaryFileResponse(result,temporary_directory=folder,media_type='audio/mp4' if format=='m4a' else 'audio/wav',filename=result.name)
    except AudioError as error:
        shutil.rmtree(folder,ignore_errors=True);raise HTTPException(422,{'code':'INVALID_AUDIO','message':str(error)})
    except Exception as error:
        shutil.rmtree(folder,ignore_errors=True)
        # No audio contents or credentials in logs. Preserve a meaningful model error.
        print(f'Inference failed: {type(error).__name__}: {str(error)[:700]}',flush=True)
        raise HTTPException(500,{'code':'INFERENCE_FAILED','message':f'Seed-VC推理失败：{type(error).__name__}: {str(error)[:300]}'})
    finally:inference_lock.release()
