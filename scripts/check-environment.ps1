. (Join-Path $PSScriptRoot 'common.ps1')
foreach ($name in @('node','npm','java','mvn','python','git')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) { Write-Output "$name : $($command.Source)" } else { Write-Output "$name : 未安装或未加入PATH" }
}
Get-PSDrive D | Select-Object Name,Free
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader }
Write-Output 'Windows不执行本地iOS编译。独立IPA通过EAS云端macOS构建，仍需要苹果会员、设备登记和签名。'
