. (Join-Path $PSScriptRoot 'common.ps1')
$configurationPath = Join-Path $RuntimeRoot 'local-env.json'
if (Test-Path -LiteralPath $configurationPath) { Write-Output '已有本机配置，保留原Token。'; exit 0 }
function New-ApiSecret { return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
$apiToken = New-ApiSecret
$aiToken = New-ApiSecret
@{
    AIVOICE_API_TOKEN = $apiToken
    AIVOICE_AI_TOKEN = $aiToken
    AIVOICE_DATA = (Join-Path $ProjectRoot 'backend/data')
    AIVOICE_TMP = (Join-Path $ProjectRoot 'backend/data/tmp')
    AIVOICE_AI_DATA = (Join-Path $ProjectRoot 'ai-service/data')
    AIVOICE_AI_URL = 'http://127.0.0.1:8090'
    SEED_VC_DIR = (Join-Path $ProjectRoot 'ai-service/vendor/seed-vc')
    SEED_RUNTIME = (Join-Path $RuntimeRoot 'seed')
    SEED_AUTO_DOWNLOAD = '0'
    SEED_DEVICE = 'auto'
    BIND_ADDRESS = '127.0.0.1'
} | ConvertTo-Json | Set-Content -LiteralPath $configurationPath -Encoding utf8
New-Item -ItemType Directory -Path (Join-Path $ProjectRoot 'backend/data/tmp') -Force | Out-Null
Write-Output "配置已写入 $configurationPath。Token不在终端回显；将AIVOICE_API_TOKEN复制到App设置。"
