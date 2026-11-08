# Windows → GitHub Actions → iPhone 安装指南

本指南对应 `D:\桌面文件\AIVoice`，用于**普通免费 Apple ID + Windows Sideloadly**。编译运行在 GitHub 的 macOS 机器，Windows 负责上传源码、下载 IPA 和 USB 安装。

生成的是 **Release / iphoneos / ARM64 / 未签名 IPA**。它含原生模块和 JavaScript Bundle，启动不需要 Expo Go 或 Metro，但必须先由 Sideloadly 重签名才可安装。云端没有 Apple 登录，也没有创建或修改任何 Expo 云端项目。

## 1. 已保留的项目配置

| 配置 | 当前值 |
| --- | --- |
| Expo Owner | `shandexindevelopapp` |
| Slug | `ai-voice-changer` |
| Expo Project ID | `cd4cfc12-db9c-4f1f-99b1-746f5c958901` |
| Bundle Identifier | `dev.personal.aivoice` |
| Expo / React Native | `~58.0.23` / `0.88.1` |
| React / Node | `19.3.0` / CI 固定 `22.20.0` |
| macOS / Xcode | 标准 `macos-26` / 固定 `26.6` |
| Workflow | **iOS Unsigned IPA (Sideloadly)** |
| 文件 | `.github/workflows/ios-build.yml` |

SDK 58 官方要求 Node 22.13.x 以上、Xcode 26.4 以上、iOS 16.4 以上。本流程选择满足下限的版本；Xcode 26.6 在当前 GitHub macOS 26 镜像中提供。将来 GitHub 移除该版本时，先核对镜像及 SDK 要求，再更新 workflow 的 `DEVELOPER_DIR`，不要随意切到 Simulator 或旧 Xcode。

来源：[Expo SDK 58 支持矩阵](https://docs.expo.dev/versions/v58.0.0/)、[GitHub macOS 26 镜像清单](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)。

`mobile/app.json`、`mobile/app.config.ts`、`mobile/eas.json`、`mobile/package.json`、依赖版本和业务代码均保持原样。锁文件仅将 598 个 `resolved` 下载地址从国内镜像切换到 npm 官方源，所有版本、完整性校验和依赖关系保持原样。录音权限、SecureStore、本地历史和分享功能保留。已有 EAS preview 是另一条构建路线，这个 GitHub workflow 不执行 EAS Build，也不需要其签名配置。

## 2. 费用和账号条件

- 需要 GitHub 账号和能使用 Actions 的仓库。
- **无需额外 GitHub Secrets**：不填 `EXPO_TOKEN`、Apple ID、密码、证书、私钥或 Team ID。GitHub 自动提供的只读仓库令牌足够 checkout；关闭了令牌持久化。
- 公开仓库使用标准 GitHub-hosted runner 的计算免费；私有仓库受账号包含用量限制。Artifact 存储也有额度。本流程只手动触发、禁用依赖缓存、产物保留 **3 天**，不自动启动付费大规格 runner。若用私有仓库，请在 Billing / Actions 查看余额和预算，不能把“私有仓库不限次数免费”当作承诺。
- 公开仓库意味着源码公开。先检查上传副本；若不愿公开，选择私有仓库并检查免费额度，勿为使用免费计算公开私密信息。

来源：[GitHub Actions 计费规则](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

## 3. 准备安全的上传副本

**2026-11-08 更新：本项目现已整理为根目录统一 Git 仓库，origin 为 [cofe-man0525/iphone](https://github.com/cofe-man0525/iphone)。** 后续直接在项目根目录提交完整源码，详见 [GitHub 上传与编译](github-upload.md)。旧 mobile Git 元数据保存在 `.runtime/git-backups/`。下方源码副本方案保留供另行导出移动端使用，不再是此仓库的必需步骤。

**整理前原目录根部不是 Git 仓库，但 `mobile/.git` 曾独立存在。** 遇到这类结构时，不要直接在原目录 `git init` 后 `git add mobile`：Git 可能把 mobile 当嵌套仓库，云端拿不到它的文件。下面的导出方案通过脚本创建没有嵌套 `.git` 的源码副本。

在 PowerShell 执行：

```powershell
Set-Location 'D:\桌面文件\AIVoice'
python .\scripts\prepare-github-upload.py
```

终端输出一个新文件夹，例如：

```text
D:\桌面文件\AIVoice\.runtime\github-upload-20261108-180000
```

**用终端实际输出的路径，时间戳每次不同。** 脚本逐文件校验 SHA-256；不删除、不移动原项目或原 Git 历史，也不连接 GitHub。

副本包含移动端源码、锁文件、CI 脚本、文档和 `.github`，不复制模型、录音、依赖、服务器运行数据、`.env` 或签名文件。`SOURCE-MANIFEST.json` 列出复制文件及哈希。它是**移动端编译源码副本**，不包含后台服务源码；后台仍保留在原项目并需另行运行。以后修改原移动端，重新生成副本，再把变更同步到同一仓库即可；副本上传后不是原目录的自动同步。

检查副本根目录应为：

```text
.github/
  workflows/ios-build.yml
mobile/
  app/
  src/
  assets/
  package.json
  package-lock.json
  app.json
  app.config.ts
  eas.json
scripts/
  ios/
    build_unsigned.py
    verify_app.py
    test_verify_app.py
docs/
  ios-install.md
.gitignore
README.md
SOURCE-MANIFEST.json
```

不要让整个 `AIVoice` 文件夹再套在仓库里面；`.github` 和 `mobile` 必须直接位于 GitHub 仓库根部。上传前检查代码中是否另有手写的账号或 Token；文件过滤不能代替检查代码内容。

### 用 GitHub Desktop 上传（推荐）

1. 打开 GitHub Desktop，登录自己的 GitHub 账号。
2. **File → Add local repository**，选择上面生成的副本目录。
3. 若提示目录不是仓库，选择 **create a repository here**，确认本地路径就是副本目录，不多嵌套一层文件夹。
4. 在 Changes 中确认能看到 `.github/workflows/ios-build.yml`、`mobile/package-lock.json` 和移动端代码。不能出现 `node_modules`、模型、用户音频、`.env`、私钥。
5. 填写提交说明并 **Commit to main**，然后 **Publish repository**。仓库名可用 `ai-voice-changer-ios`；公开/私有按费用与隐私需求选择。
6. 在 GitHub 网页根目录确认 `.github`、`mobile`、`scripts` 同级，并确认 `mobile` 能展开为普通文件夹。

### 已习惯 Git 命令时

在**副本目录**执行以下命令。把网址替换成自己新建的空仓库地址，账号验证交给 Git 凭据管理器，不把 Token 写进命令或项目。

```powershell
git init -b main
git add .
git status --short
git commit -m "Configure unsigned iPhone IPA build"
git remote add origin https://github.com/YOUR_ACCOUNT/ai-voice-changer-ios.git
git push -u origin main
```

如果只上传 `mobile` 文件夹，Actions 看不到根目录的 workflow，因此不能编译。

## 4. 手动运行 Actions

1. 打开仓库网页，点上方 **Actions**。
2. 如果有首次启用提示，启用此仓库的 Actions。
3. 左边选择 **iOS Unsigned IPA (Sideloadly)**。
4. 点 **Run workflow**，选择 `main`，再点绿色 **Run workflow**。
5. 打开新出现的运行记录，查看各步骤日志，等它完成。首次安装 Pods 和编译可能比较久；流程超时设置为 90 分钟，不保证固定耗时。

只有 `workflow_dispatch`，上传或修改代码不会自动消耗编译次数。第一次运行前，workflow 文件必须已经位于默认分支。若没有 Run workflow 按钮，检查默认分支、文件位置、仓库 Actions 权限。

编译步骤依次执行：

1. 选择 Xcode 26.6，确认存在 `iphoneos` SDK。
2. 在 `mobile` 执行真正的 `npm ci`，严格使用已提交锁文件。
3. TypeScript、移动端逻辑测试和 Expo 依赖兼容性检查。
4. 检查最终 Expo 配置，保留现有项目身份及 Bundle ID。
5. 当前没有 `ios/`，执行 `expo prebuild --platform ios --no-install`；不使用 `--clean`。Expo CLI 的 `--no-install` 与 `--npm` 互斥，不同时传入；依赖安装已由前面的 `npm ci` 完成。将来若已提交手工维护的 `ios/`，先验证 Podfile / Xcode 工程存在，**跳过 Prebuild**，不会覆盖原生修改。
6. `pod install`；已有 Podfile.lock 时加 `--deployment`，不悄悄升级原生依赖。
7. 从 shared schemes 及 Release build settings 找到 Bundle ID 匹配的实际应用方案。
8. `xcodebuild archive -configuration Release -sdk iphoneos -destination 'generic/platform=iOS'`，同时关闭 `CODE_SIGNING_ALLOWED`、`CODE_SIGNING_REQUIRED`，清空签名身份和 Team。
9. 在 archive 的 `Products/Applications` 找到真正的 `.app`，在打包副本中去除可能自带的框架签名。
10. 检查 Info.plist、麦克风权限、ARM64 Mach-O 的 **iOS 平台**、动态 Framework 依赖、非空 Release JS Bundle。静态链接的 Expo / React 模块不要求虚构一个独立 `.framework`。ARM64 Simulator 同样会被拒绝。
11. 用 macOS `ditto` 保留权限和符号链接，生成 `Payload/实际名称.app` 的 IPA，再检查 ZIP 内文件与 `.app` 一致，输出校验报告和 SHA-256。

无 Apple ID 登录步骤、无 `eas init`、无新建云端项目、无需要证书的 `xcodebuild -exportArchive`。若以后原生项目有多个应用 scheme，可在 workflow 的 `env` 显式增加 `IOS_SCHEME`；它不是 Secret。

## 5. 下载 IPA

运行成功显示绿色后，在该次运行页面底部 **Artifacts** 下载：

```text
AI-Voice-Changer-unsigned-iphoneos-运行编号
```

GitHub 下载的是外层 ZIP。解压后应包含：

```text
AI-Voice-Changer-unsigned-iphoneos.ipa
validation.json
SHA256SUMS.txt
```

保留 `.ipa` 后缀，**不要再解压 IPA**，也不要把 GitHub 外层 ZIP 拖进 Sideloadly。`validation.json` 的 `installationTested` 固定为 `false`，因为编译成功不等于已在你的手机安装成功。

可在 Windows 核对哈希：

```powershell
Get-FileHash '.\AI-Voice-Changer-unsigned-iphoneos.ipa' -Algorithm SHA256
```

结果应与 `SHA256SUMS.txt` 相同。Artifact 链接需要 GitHub 登录且 3 天后过期；已下载文件不会随链接失效删除。到期后重新手动编译或在到期前下载保存。

如果失败，只会在有日志时上传 `ios-build-diagnostics-运行编号`，不会提供假 IPA。先看日志中**第一个错误**；诊断包不是可安装包。

## 6. Windows Sideloadly 安装

1. USB 连接 iPhone，解锁手机，允许“信任此电脑”。你现在已经能识别手机，无需重新折腾工作正常的驱动。
2. 打开 Windows Sideloadly，确认设备下拉框选择自己的 iPhone。
3. 把解压得到的 **`.ipa` 文件**拖入 Sideloadly 的 IPA 区域。
4. 在 Sideloadly **本机界面**填写自己的 Apple ID，选择普通 Apple ID 侧载模式，点击 **Start**。按提示输入密码和双重认证验证码。不要上传这些信息到 GitHub，也不要填入 Actions Secrets。
5. 等待签名、上传和安装完成。如果提示 App ID 冲突，用 Sideloadly 的 Bundle ID 选项设定自己唯一的标识，之后更新安装保持同一标识和同一 Apple ID。源码中的原 Bundle ID 不需要因此改掉。
6. iPhone 如果提示开发者未受信任，在 **设置 → 通用 → VPN 与设备管理** 找到本人账号对应的开发者项目，按系统提示信任。
7. 如果提示启用开发者模式，在 **设置 → 隐私与安全性 → 开发者模式** 打开，按提示重启并确认。菜单出现时机、验证步骤可能因 iOS 版本而异，按手机实际提示操作。
8. 打开 AI 变声器，首次录音允许麦克风权限，做下面的真机检查。

Sideloadly 官方支持免费 Apple ID，但最终安装仍受 Apple 账号状态、设备系统和签名能力限制。免费 Personal Team 的描述文件通常 **7 天**到期，每台设备最多 3 个此类 App；到期需重签安装。可启用 Sideloadly 自带自动刷新并按其 USB / Wi-Fi 连接条件保持电脑可用；不能当成永久签名。未修改源码时一般直接重签保存的同一 IPA，无需每 7 天重新云编译。

来源：[Sideloadly 官方功能及安装流程](https://sideloadly.io/)、[Apple Personal Team 限制](https://developer.apple.com/help/account/basics/about-your-developer-account)、[Apple 开发者模式说明](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)。

## 7. 免费账号能力检查

本次 Expo public / introspect 的 iOS entitlements 均为空。项目没有显式要求推送、iCloud、App Groups、Sign in with Apple、关联域或共享 Keychain 分组等额外能力。麦克风用途说明属于 Info.plist 权限，不是付费能力；当前 SecureStore 使用 App 自身 Keychain，不依赖手工指定跨 App 分组。

CI 会再次检查生成的 `.entitlements` 文件。除由重签工具处理的基本身份键外，发现其他 entitlement 就停止并指出键名，要求核对免费账号能力，**不会悄悄删除配置或原功能**。例如 `aps-environment`、`com.apple.security.application-groups`、`com.apple.developer.icloud-container-identifiers`、手动 `keychain-access-groups` 需要额外检查。空 entitlements 是当前配置检查结果，不是对所有未来依赖与 Apple 账号的保证。

来源：[Apple iOS capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios/)。

## 8. 安装后的功能验证

- 关闭电脑的 Metro，确认 App 仍能独立启动。
- 麦克风允许后录制一段自己的声音，试听并重启 App，确认历史恢复。
- 在设置中填写你已部署的 **HTTPS 后端地址**和业务 Token。不要用 iPhone 上的 `127.0.0.1` 访问 Windows 服务；它指向手机自身。
- 本流程只编译手机 App，**不部署 Java / AI 服务，也不把模型装入手机**。服务器、授权参考录音和模型仍需原有部署；服务器不可访问时，安装成功也不能完成 AI 转换。
- 导入拥有授权的参考音频，实际转换、播放、导出及调用系统分享，检查微信 / 抖音是否接受音频文件。分享音频文件不保证变成聊天软件原生语音气泡。
- 后续重签尽量保持 Apple ID 与 Bundle ID 一致，不要随意卸载 App，以免丢失本地录音；重要录音先导出备份。

## 9. 本机验证与云端待验证范围

详见同目录 `ios-build-validation.md` 的实际记录。Windows 已检查锁文件、Expo 配置、依赖、TypeScript、逻辑测试、YAML、IPA 校验规则和源码上传范围。随后 [Actions #2](https://github.com/cofe-man0525/iphone/actions/runs/42486951928) 成功完成 macOS CocoaPods、Xcode 真机 Release 编译、真实 `.app` 检查和未签名 IPA 打包；产物已下载到本机 `deliverables/ios/` 并复核。

**当前已得到真实 iphoneos / ARM64 未签名 IPA；Sideloadly 重签与 iPhone 实际安装仍待本人执行。** 没有使用 Simulator 产物冒充真机 IPA。

## 10. 常见错误

| 错误 | 处理 |
| --- | --- |
| Actions 看不到 workflow | `.github/workflows/ios-build.yml` 必须位于仓库根部和默认分支，检查 Actions 已启用 |
| 找不到 mobile/package-lock.json | 上传层级错误，或 mobile 被当作嵌套 Git 仓库；使用安全副本 |
| `npm ci` 锁文件不匹配 | 本地在 mobile 修正依赖和锁文件并一起提交；不要在 CI 换成 npm install 来掩盖问题 |
| 找不到 Xcode_26.6 | 核对 runner-images 官方清单，选满足 SDK 58 的 Xcode 26.4+，更新 DEVELOPER_DIR |
| Pod 安装失败 | 查看对应 pod install 日志；已有手工 lock 时保持 --deployment，不随意升级原生库 |
| entitlements 检查停止 | 按错误列出的能力核对免费 Apple ID 支持，不随意删功能绕过 |
| 找不到 shared scheme | 手工原生工程需共享应用 scheme 并提交；当前自动 Prebuild 应生成它 |
| 没有 JS bundle 或缺 framework | 查看 Release bundling / embed frameworks 日志；流程会拒绝上传不完整 IPA |
| Sideloadly 签名失败 | 查看 Sideloadly 的具体账号、App ID、设备额度或认证错误；不要把未签名 IPA 当作可直接安装文件 |
| 手机显示到期 / 不能验证 | 检查网络、开发者信任及 7 天签名期限，按提示重签 |
| 能启动但不能变声 | 检查 HTTPS API、业务 Token、后台和模型运行状态；这与 IPA 签名是不同步骤 |
