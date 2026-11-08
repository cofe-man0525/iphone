# AI Voice Changer · AI 变声器

原生 React Native / Expo iPhone 应用 + Java 17 / Spring Boot 3.3.5 业务服务 + Python / FastAPI / Seed-VC 推理服务。源码目录为 `D:\桌面文件\AIVoice`。

项目仓库：[cofe-man0525/iphone](https://github.com/cofe-man0525/iphone)。完整源码采用根目录统一 Git 仓库；现有远程历史与原 mobile Git 元数据均保留。更新代码及手动运行 Actions 见 [GitHub 上传与编译](docs/github-upload.md)。

本项目不包含预设人物的参考声音。七类产品音色在没有授权参考录音时均不可转换；用户导入自己拥有使用权的参考录音后，才能用 Seed-VC 做真实转换。模型不可用时返回错误，不回退到普通变调或假结果。

## 目录

- `mobile/`：原生录音、播放、音色管理、历史、SecureStore 和 iOS 分享。
- `backend/`：任务队列、持久化、鉴权、音频存储和 AI 服务客户端。
- `ai-service/`：音频校验、可替换模型适配器、Seed-VC 推理。
- `scripts/`：Windows 检查、启动与构建前检查。
- `docs/`：部署、接口、EAS 与真机测试说明。
- `.runtime/`：忽略提交的下载、模型、依赖缓存和测试产物。

## 已实现

原生四标签页面、60秒麦克风录音、音频中断与页面切换处理、全局单播放器与拖动进度、授权参考音色导入和试听、原声/AI结果比较、M4A/WAV导出、系统文件分享、重启可恢复的本地历史、SecureStore Token、主题与连接设置。

Java服务实现 `/api` 全部业务接口、Bearer鉴权、真实音频校验、单工作线程队列、JSON原子持久化、删除/清理、超时与真实故障传播。FastAPI只绑定回环地址，加载固定版本Seed-VC，推理不使用Mock或变调回退。后端仅面向单用户，没有会员、支付、注册或多租户模块。

## 本机验证结果

- TypeScript通过、移动逻辑6项通过、Expo工程20/20通过、iOS Hermes包生成通过。
- Java接口5项通过；FastAPI与真实FFmpeg校验4项通过。
- 真实Spring→FastAPI→Seed-VC GPU推理已通过，生成M4A和WAV，格式、下载、解码、非静音和时长检查通过。
- 原声约7.882秒，M4A约7.895秒、WAV约7.872秒。辅助本地ASR识别出相同中文内容，简繁与标点有所差异。这不替代人类音质评价。
- 24项开发者布局检查通过。网页预览只用于布局检查，不是H5/PWA成品。

**尚未完成iPhone真机、微信/抖音接收及签名IPA安装验证。** 已关联原有 Expo 云端项目；GitHub macOS 真机编译及 Sideloadly 重签仍待实际验证，不声称已得到可安装IPA。原有应用测试证据及范围见 [测试记录](docs/测试记录.md)，新增编译流程见下方安装指南。

## Windows 启动

本目录已经准备了依赖、固定源码与核验后的模型缓存。生成的本机连接配置在忽略提交的 `.runtime/local-env.json`，Token不在报告中公开。

分别在两个PowerShell窗口执行：

```powershell
Set-Location 'D:\桌面文件\AIVoice'
./scripts/start-ai.ps1
```

```powershell
Set-Location 'D:\桌面文件\AIVoice'
./scripts/start-backend.ps1
```

AI默认 `127.0.0.1:8090`，业务默认 `127.0.0.1:8089`。首次在其他机器上安装见 [Windows运行](docs/Windows运行.md) 和 [模型说明](docs/模型与许可证.md)。本机JDK21以Java17目标编译，字节码major version为61。

## iPhone 构建与安装

**Windows + 免费 Apple ID：** 现在可使用根目录 `.github/workflows/ios-build.yml`，手动运行 GitHub Actions **iOS Unsigned IPA (Sideloadly)**，下载未签名真机 IPA 后在 Windows 用 Sideloadly 重签并 USB 安装。无需额外 GitHub Secrets。现有仓库直接在项目根目录提交；另行导出移动端时可用 `python scripts/prepare-github-upload.py`。完整步骤和费用条件见 [GitHub Actions / Sideloadly 安装指南](docs/ios-install.md)，本机检查范围见 [验证记录](docs/ios-build-validation.md)。此流程尚待 GitHub macOS 实际编译和 iPhone 安装验证。

以下保留原有 EAS 签名构建路线：

先在 `mobile/.env` 配置你已有项目的真实 `EXPO_PROJECT_ID`、Owner及明确选择的Bundle ID，再关联已有项目。没有调用过云端项目创建。

```powershell
Set-Location 'D:\桌面文件\AIVoice'
./scripts/build-ios.ps1
```

入口先做本地构建守卫和既有项目查询，再执行EAS Preview云端macOS Release构建。Preview无需Metro即可启动。Apple Developer会员、设备登记、证书与Ad Hoc签名由你本人完成；详见 [EAS与iPhone安装](docs/EAS与iPhone安装.md)。

安装后填写部署的HTTPS API地址及业务Token，录音、添加授权参考音色、选择音色、转换、试听，再使用系统分享或“存储到文件”。系统分享是否被微信/抖音接收，以 [真机测试清单](docs/真机测试清单.md) 的实际结果为准，文件不等于原生语音条。

## 其他交付

- [服务器部署](docs/服务器部署.md)：回环服务、HTTPS代理、systemd模板。
- [API文档](docs/API.md)：接口、字段、状态和错误码。
- [模型与许可证](docs/模型与许可证.md)：固定提交、权重来源、哈希、依赖兼容。
- `scripts/test-all.ps1`：自动化检查；`scripts/test-network.py`：实际跨服务验证。
- `deliverables/AI-Voice-Changer-源码.zip`：源码包，排除密钥、用户音频、模型和依赖。
