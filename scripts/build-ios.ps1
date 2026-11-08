. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location -LiteralPath (Join-Path $ProjectRoot 'mobile')
# Fail locally before EAS can offer to initialize/create a cloud project.
& npm run check:build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& npx eas-cli@latest project:info
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& npx eas-cli@latest build --platform ios --profile preview
exit $LASTEXITCODE
