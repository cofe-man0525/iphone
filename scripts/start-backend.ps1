. (Join-Path $PSScriptRoot 'common.ps1')
Import-LocalConfiguration
Set-Location -LiteralPath (Join-Path $ProjectRoot 'backend')
& mvn -q "-Dmaven.repo.local=$RuntimeRoot/m2" package -DskipTests
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& java '-Dfile.encoding=UTF-8' -jar (Join-Path $ProjectRoot 'backend/target/aivoice-backend-1.0.0.jar')
exit $LASTEXITCODE
