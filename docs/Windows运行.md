# Windows 本地运行

所有命令以PowerShell为例。项目根目录：`D:\桌面文件\AIVoice`。需要Node.js兼容Expo SDK 58、Java 17+（编译目标17）、Maven、Python 3.11、Git。CUDA推理还需要可用的NVIDIA驱动。

```powershell
Set-Location 'D:\桌面文件\AIVoice'
./scripts/check-environment.ps1
./scripts/init-local.ps1
```

初始化脚本只在不存在时创建 `.runtime/local-env.json`，生成独立的业务API与内部AI Token。不要将此文件发到公开仓库。打开文件，将 `AIVOICE_API_TOKEN` 复制到App的设置页，内部AI Token不用填到App。

## 安装

```powershell
Set-Location 'D:\桌面文件\AIVoice\mobile'
npm ci
Set-Location 'D:\桌面文件\AIVoice'
python -m venv ai-service/.venv
./scripts/install-model.ps1 -Device cuda
```

无NVIDIA显卡时将最后一行改为 `-Device cpu`，不保证实时性能。脚本固定官方代码提交，不覆盖已有修改。

如官方PyTorch大文件下载一直无进度，可在具备httpx的Python中运行 `python scripts/download-torch.py`，它使用官方链接、分段下载与官方SHA256校验。下载完毕后可从 `.runtime/wheels/` 安装对应wheel，再安装两份requirements。此辅助下载器针对Windows Python 3.11 CUDA 12.1，Linux不要使用该wheel。

## 启动

分别打开两个PowerShell窗口，在项目根目录执行：

```powershell
./scripts/start-ai.ps1
```

```powershell
./scripts/start-backend.ps1
```

默认AI服务为 `127.0.0.1:8090`，业务为 `127.0.0.1:8089`。不会占用你已有的8081/8082/8083。正常AI启动采用离线加载；首次必须先完成模型下载。

第三个窗口运行 `./scripts/start-mobile.ps1` 可进行开发调试。最终iPhone安装按 `EAS与iPhone安装.md` 使用EAS Preview独立构建。

App不能使用电脑的 `localhost` 连接电脑。独立Preview使用部署好的HTTPS服务地址；局域网开发需显式配置 `AIVOICE_ALLOW_LOCAL_HTTP=1` 并创建相应开发构建，不用于正式内部分发。默认绑定本机回环，远程访问需你明确配置服务监听或HTTPS反向代理。

## 检查

```powershell
./scripts/test-all.ps1
```

该脚本运行类型检查、6项移动逻辑测试、Expo检查、Java接口测试和Python协议/真实音频校验测试。Java测试使用明确的AI传输桩，只验证业务契约；Python的无权重测试明确验证模型未就绪错误，两者都不冒充真实AI转换测试。

运行 `ai-service/bootstrap_model.py` 检查真实模型加载。真实转换记录见 `测试记录.md`。源代码可以在Windows完成；Windows无法在本地签名编译iOS应用，云端构建仍需有效苹果会员及设备登记。
