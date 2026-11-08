"""Auxiliary local-ASR/content and duration check, not a human perceptual test."""
import difflib,json,os,re,sys,wave
from pathlib import Path
import httpx
root=Path(__file__).resolve().parent.parent
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['MPLCONFIGDIR']=str(root/'.runtime'/'matplotlib');os.environ['NUMBA_CACHE_DIR']=str(root/'.runtime'/'numba');os.environ['CUDA_CACHE_PATH']=str(root/'.runtime'/'cuda-cache')
snapshot=root/'.runtime'/'seed'/'checkpoints'/'hf_cache'/'models--openai--whisper-small'/'snapshots'/'973afd24965f72e36ca33b3055d56a652f456b4d'
files=['added_tokens.json','vocab.json','merges.txt','normalizer.json','special_tokens_map.json','tokenizer_config.json','tokenizer.json','generation_config.json']
with httpx.Client(timeout=30,trust_env=False,follow_redirects=True) as client:
    for name in files:
        path=snapshot/name
        if not path.exists():
            response=client.get(f'https://hf-mirror.com/openai/whisper-small/resolve/973afd24965f72e36ca33b3055d56a652f456b4d/{name}');response.raise_for_status();path.write_bytes(response.content)
import numpy as np,torch
from transformers import AutoProcessor,WhisperForConditionalGeneration
sys.path.insert(0,str(root/'ai-service'))
from audio import ffmpeg
processor=AutoProcessor.from_pretrained(str(snapshot),local_files_only=True)
device='cuda' if torch.cuda.is_available() else 'cpu';dtype=torch.float16 if device=='cuda' else torch.float32
model=WhisperForConditionalGeneration.from_pretrained(str(snapshot),torch_dtype=dtype,local_files_only=True).to(device).eval()
records=[]
for label,source in [('source',root/'.runtime'/'fixtures'/'source.wav'),('converted',root/'.runtime'/'real-ai-result.wav'),('m4a',root/'.runtime'/'real-ai-result.m4a')]:
    normalized=root/'.runtime'/('quality-'+label+'.wav');ffmpeg(['-i',str(source),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(normalized)])
    with wave.open(str(normalized),'rb') as audio:
        samples=np.frombuffer(audio.readframes(audio.getnframes()),dtype='<i2').astype(np.float32)/32768;duration=len(samples)/16000
    assert np.isfinite(samples).all() and np.sqrt(np.mean(samples**2))>.001,'Output is silent or invalid'
    data=processor(samples,sampling_rate=16000,return_tensors='pt',return_attention_mask=True)
    with torch.inference_mode():ids=model.generate(data.input_features.to(device,dtype),attention_mask=data.attention_mask.to(device),language='zh',task='transcribe',max_new_tokens=128)
    text=processor.batch_decode(ids,skip_special_tokens=True)[0]
    records.append({'type':label,'duration':round(duration,3),'rms':round(float(np.sqrt(np.mean(samples**2))),5),'text':text})
normalize=lambda text:re.sub(r'[^\w\u4e00-\u9fff]','',text)
reference=normalize(records[0]['text'])
for item in records[1:]:item['asrTextSimilarity']=round(difflib.SequenceMatcher(None,reference,normalize(item['text'])).ratio(),3);assert abs(item['duration']-records[0]['duration'])<.5
result={'method':'Local Whisper-small ASR comparison; not a perceptual-quality or timbre-similarity guarantee','audio':records}
(root/'.runtime'/'audio-quality.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
