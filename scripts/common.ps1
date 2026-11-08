$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$RuntimeRoot = Join-Path $ProjectRoot '.runtime'
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
$env:TEMP = $RuntimeRoot
$env:TMP = $RuntimeRoot
$env:PYTHONUTF8 = '1'
$env:npm_config_cache = Join-Path $RuntimeRoot 'npm-cache'
$env:HF_HOME = Join-Path $RuntimeRoot 'huggingface'
$env:TORCH_HOME = Join-Path $RuntimeRoot 'torch'
$env:MPLCONFIGDIR = Join-Path $RuntimeRoot 'matplotlib'
$env:NUMBA_CACHE_DIR = Join-Path $RuntimeRoot 'numba'
$env:CUDA_CACHE_PATH = Join-Path $RuntimeRoot 'cuda-cache'
$env:IPYTHONDIR = Join-Path $RuntimeRoot 'ipython'
function Import-LocalConfiguration {
    $configurationPath = Join-Path $RuntimeRoot 'local-env.json'
    if (-not (Test-Path -LiteralPath $configurationPath)) { throw '先运行 scripts/init-local.ps1 生成本机配置。' }
    $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
    foreach ($property in $configuration.PSObject.Properties) { [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process') }
}
