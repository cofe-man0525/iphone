. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath (Join-Path $ProjectRoot 'mobile')
& npm run typecheck
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& npm test
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& npx expo-doctor
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Set-Location -LiteralPath (Join-Path $ProjectRoot 'backend')
& mvn -q "-Dmaven.repo.local=$RuntimeRoot/m2" test
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Set-Location -LiteralPath (Join-Path $ProjectRoot 'ai-service')
$python = Join-Path $ProjectRoot 'ai-service/.venv/Scripts/python.exe'
& $python test_service.py
exit $LASTEXITCODE
