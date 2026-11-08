"""Real FFmpeg validation and unavailable-model contract; does not fake inference."""
import io,math,os,sys,unittest,wave
from array import array
from pathlib import Path
ROOT=Path(__file__).resolve().parent
os.environ['AIVOICE_AI_DATA']=str(ROOT.parent/'.runtime'/'ai-test-data')
os.environ['AIVOICE_AI_TOKEN']='private-test-token'
sys.path.insert(0,str(ROOT))
from fastapi.testclient import TestClient
import main
from seed_adapter import SeedVCAdapter
client=TestClient(main.app);headers={'Authorization':'Bearer private-test-token'}
def audio(seconds=4):
    rate=22050;stream=io.BytesIO();samples=array('h',(int(3000*math.sin(2*math.pi*440*i/rate)) for i in range(int(rate*seconds))))
    with wave.open(stream,'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(samples.tobytes())
    return stream.getvalue()
class ServiceTests(unittest.TestCase):
    def test_auth_and_model_not_ready(self):
        self.assertEqual(client.get('/internal/health').status_code,401)
        response=client.get('/internal/health',headers=headers);self.assertFalse(response.json()['ready'])
        response=client.post('/internal/convert',headers=headers,files={'audio':('source.wav',audio()),'reference':('ref.wav',audio())})
        self.assertEqual(response.status_code,503);self.assertEqual(response.json()['detail']['code'],'MODEL_NOT_READY')
    def test_real_decode_and_cleanup(self):
        response=client.post('/internal/normalize',headers=headers,files={'audio':('source.any',audio())})
        self.assertEqual(response.status_code,200,response.text[:200]);self.assertEqual(response.headers['content-type'],'audio/wav');self.assertAlmostEqual(float(response.headers['x-audio-duration']),4,places=2)
        with wave.open(io.BytesIO(response.content),'rb') as result:self.assertEqual(result.getframerate(),22050)
        self.assertEqual(list(main.DATA.iterdir()),[])
    def test_corrupt_empty_oversized_long_and_short_reference(self):
        for data,kind in [(b'broken','source'),(b'','source'),(b'#EXTM3U\nhttp://127.0.0.1/secret','source'),(audio(61),'source'),(audio(1),'reference')]:
            response=client.post('/internal/normalize',headers=headers,files={'audio':('a.wav',data)},data={'kind':kind});self.assertEqual(response.status_code,422,response.text)
        response=client.post('/internal/normalize',headers=headers,files={'audio':('big.wav',b'x'*(20*1024*1024+1))});self.assertEqual(response.status_code,413)
        self.assertEqual(list(main.DATA.iterdir()),[])
    def test_missing_source_reports_real_error(self):
        previous=os.environ.get('SEED_VC_DIR');os.environ['SEED_VC_DIR']=str(ROOT/'does-not-exist')
        try:model=SeedVCAdapter();model.load();self.assertFalse(model.ready);self.assertIn('缺少Seed-VC源码',model.error)
        finally:
            if previous is None:os.environ.pop('SEED_VC_DIR',None)
            else:os.environ['SEED_VC_DIR']=previous
if __name__=='__main__':unittest.main(verbosity=2)
