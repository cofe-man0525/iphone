"""Package reviewable sources only; never ship credentials, recordings or dependencies."""
from pathlib import Path
import os
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
output=root/'deliverables';output.mkdir(exist_ok=True)
target=output/'AI-Voice-Changer-源码.zip'
excluded={'.runtime','.venv','node_modules','.git','.expo','target','vendor','data','dist','deliverables','__pycache__','ios','android'}
files=[]
for folder,directories,names in os.walk(root):
    directories[:]=[name for name in directories if name not in excluded]
    for name in names:
        path=Path(folder)/name;relative=path.relative_to(root)
        if (path.name.startswith('.env') or path.name.endswith('.env')) and path.name!='.env.example':continue
        if path.suffix.lower() in ['.wav','.m4a','.mp3','.ipa','.apk','.whl','.pt','.pth','.bin','.safetensors','.log']:continue
        files.append((path,relative))
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
    for path,relative in files:archive.write(path,'AIVoice/'+relative.as_posix())
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert all(not any(part in excluded for part in Path(name).parts) for name in archive.namelist())
    assert not any(name.endswith('/.env') or 'local-env.json' in name for name in archive.namelist())
print(str(target));print(f'{len(files)} source files, {target.stat().st_size} bytes; no models, credentials or recordings.')
