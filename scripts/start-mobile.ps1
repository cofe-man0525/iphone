. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath (Join-Path $ProjectRoot 'mobile')
& npm start
exit $LASTEXITCODE
