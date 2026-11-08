import os,subprocess,wave
from pathlib import Path
import imageio_ffmpeg

FFMPEG=os.environ.get('FFMPEG_PATH') or imageio_ffmpeg.get_ffmpeg_exe()
class AudioError(ValueError):pass

def supported(path:Path):
    with path.open('rb') as stream:head=stream.read(16)
    return ((head[:4]==b'RIFF' and head[8:12]==b'WAVE') or head[4:8]==b'ftyp' or head.startswith((b'ID3',b'OggS',b'fLaC')) or (len(head)>1 and head[0]==255 and head[1]&224==224))

def ffmpeg(args:list[str],timeout=45):
    result=subprocess.run([FFMPEG,'-nostdin','-hide_banner','-loglevel','error','-y',*args],capture_output=True,timeout=timeout,creationflags=0x08000000 if os.name=='nt' else 0)
    if result.returncode:raise AudioError('音频无法解码或文件已损坏。')

def normalize(source:Path,target:Path,kind='source'):
    if not supported(source):raise AudioError('不支持该音频容器；请使用M4A、WAV、MP3、OGG或FLAC。')
    limit=25 if kind=='reference' else 60;minimum=3 if kind=='reference' else .5
    ffmpeg(['-protocol_whitelist','file,pipe','-i',str(source),'-t',str(limit+1),'-vn','-ac','1','-ar','22050','-c:a','pcm_s16le',str(target)])
    with wave.open(str(target),'rb') as audio:duration=audio.getnframes()/audio.getframerate()
    if duration<minimum:raise AudioError(f'音频过短；参考录音至少3秒，原声至少0.5秒。')
    if duration>limit+.05:raise AudioError(f'音频超过{limit}秒，请先截取较短的一段。')
    return duration

def encode(source:Path,target:Path,format:str):
    if format=='m4a':ffmpeg(['-i',str(source),'-vn','-ac','1','-c:a','aac','-b:a','128k','-movflags','+faststart',str(target)])
    else:ffmpeg(['-i',str(source),'-vn','-ac','1','-c:a','pcm_s16le',str(target)])
