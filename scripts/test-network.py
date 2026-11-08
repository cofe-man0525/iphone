"""Actual Spring->FastAPI HTTP smoke test, including honest model-not-ready behavior."""
import io,json,sys,time,wave
from pathlib import Path
import httpx
root=Path(__file__).resolve().parent.parent
config=json.loads((root/'.runtime'/'local-env.json').read_text(encoding='utf-8-sig'))
client=httpx.Client(base_url='http://127.0.0.1:8089',headers={'Authorization':'Bearer '+config['AIVOICE_API_TOKEN']},timeout=60,trust_env=False)
reference=(root/'.runtime'/'fixtures'/'reference.wav').read_bytes();source=(root/'.runtime'/'fixtures'/'source.wav').read_bytes()
assert client.get('/api/health',headers={'Authorization':'Bearer wrong-test-token'}).status_code==401
health=client.get('/api/health');health.raise_for_status();ready=health.json()['data']['ai']['ready']
response=client.post('/api/voices',files={'reference':('reference.wav',reference,'audio/wav')},data={'name':'自动化测试参考（系统合成）','category':'自定义音色','authorized':'true'});response.raise_for_status();voice=response.json()['data'];voice_id=voice['id'];tasks=[];results=[]
try:
    preview=client.get(f'/api/voices/{voice_id}/audio');assert preview.status_code==200 and preview.content[:4]==b'RIFF'
    formats=['m4a','wav'] if ready else ['m4a']
    for format in formats:
        response=client.post('/api/convert',files={'audio':('source.wav',source,'audio/wav')},data={'voiceId':voice_id,'format':format});assert response.status_code==202,response.text
        task=response.json()['data'];tasks.append(task['id']);deadline=time.time()+900;started=time.time()
        while task['status'] in ['QUEUED','RUNNING']:
            if time.time()>deadline:raise AssertionError('Task timeout')
            time.sleep(1);response=client.get('/api/tasks/'+task['id']);response.raise_for_status();task=response.json()['data']
        if ready:
            assert task['status']=='SUCCEEDED',task
            output=client.get('/api/tasks/'+task['id']+'/audio');output.raise_for_status()
            assert output.headers['content-type']==('audio/mp4' if format=='m4a' else 'audio/wav')
            assert output.content[4:8]==b'ftyp' if format=='m4a' else output.content[:4]==b'RIFF'
            path=root/'.runtime'/('real-ai-result.'+format);path.write_bytes(output.content)
            results.append({'format':format,'bytes':len(output.content),'seconds':round(time.time()-started,2),'task':task})
        else:
            assert task['status']=='FAILED' and task.get('error'),task
            assert client.get('/api/tasks/'+task['id']+'/audio').status_code==409
            results.append({'status':'MODEL_NOT_READY_EXPECTED','reason':task['error']})
finally:
    for task_id in tasks:assert client.delete('/api/tasks/'+task_id).status_code==200
    assert client.delete('/api/voices/'+voice_id).status_code==200
record={'realModelReady':ready,'source':'Windows local system TTS; not iPhone microphone','results':results}
(root/'.runtime'/('real-inference.json' if ready else 'network-unready.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(record,ensure_ascii=False,indent=2))
