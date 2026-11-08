param([ValidateSet('cpu','cuda')][string]$Device='cuda')
. (Join-Path $PSScriptRoot 'common.ps1')
$python = Join-Path $ProjectRoot 'ai-service/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { & python -m venv (Join-Path $ProjectRoot 'ai-service/.venv'); if ($LASTEXITCODE) { exit $LASTEXITCODE } }
$vendor = Join-Path $ProjectRoot 'ai-service/vendor/seed-vc'
$revision = '51383efd921027683c89e5348211d93ff12ac2a8'
if (-not (Test-Path -LiteralPath $vendor)) { & git clone https://github.com/Plachtaa/seed-vc.git $vendor; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
$currentRevision = & git -C $vendor rev-parse HEAD
if ($currentRevision -ne $revision) { throw "源码不是核验过的版本。请检查改动后手动切换到 $revision；脚本不覆盖已有源码。" }
$index = if ($Device -eq 'cuda') { 'https://download.pytorch.org/whl/cu121' } else { 'https://download.pytorch.org/whl/cpu' }
& $python -m pip install --no-cache-dir torch==2.4.1 torchaudio==2.4.1 --index-url $index
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& $python -m pip install --no-cache-dir -c (Join-Path $ProjectRoot 'ai-service/constraints.txt') -r (Join-Path $ProjectRoot 'ai-service/requirements.txt') -r (Join-Path $ProjectRoot 'ai-service/requirements-model.txt')
if ($LASTEXITCODE) { exit $LASTEXITCODE }
$env:SEED_VC_DIR = $vendor
$env:SEED_RUNTIME = Join-Path $RuntimeRoot 'seed'
$env:SEED_DEVICE = $Device
$env:SEED_AUTO_DOWNLOAD = '1'
Set-Location -LiteralPath (Join-Path $ProjectRoot 'ai-service')
& $python bootstrap_model.py
exit $LASTEXITCODE
