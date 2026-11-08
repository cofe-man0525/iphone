"""Validate resolved Expo native config and release profile without claiming an IPA."""
import json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
config=json.loads((root/'.runtime'/'expo-introspect.json').read_text(encoding='utf-8-sig'))
assert config['slug']=='ai-voice-changer'
assert config['sdkVersion']=='58.0.0'
plist=config['ios']['infoPlist']
assert plist['NSMicrophoneUsageDescription']
assert plist['NSAppTransportSecurity']['NSAllowsArbitraryLoads'] is False
assert 'audio' not in plist.get('UIBackgroundModes',[])
profile=json.loads((root/'mobile'/'eas.json').read_text())['build']['preview']
assert profile['distribution']=='internal' and profile['developmentClient'] is False
assert profile['ios']['simulator'] is False and profile['ios']['buildConfiguration']=='Release'
assert config.get('extra',{}).get('eas',{}).get('projectId') is None,'此检查基于尚未绑定ID的当前本机状态；绑定后更新检查预期。'
result=subprocess.run(['node','scripts/check-build.cjs'],cwd=root/'mobile',capture_output=True)
assert result.returncode!=0,'在缺少已有项目ID和明确Bundle ID时，构建守卫应拒绝执行。'
print('PASS: native microphone, HTTPS, standalone Preview, existing-project guard. No IPA built.')
