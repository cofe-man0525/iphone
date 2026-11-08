. (Join-Path $PSScriptRoot 'common.ps1')
Import-LocalConfiguration
$python = Join-Path $ProjectRoot 'ai-service/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw '缺少Python虚拟环境，先按README安装。' }
Set-Location -LiteralPath (Join-Path $ProjectRoot 'ai-service')
& $python -m uvicorn main:app --host 127.0.0.1 --port 8090 --workers 1
exit $LASTEXITCODE
