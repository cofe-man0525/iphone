# iOS GitHub Actions 配置验证记录

检查日期：2026-11-08。执行环境：Windows、Node `v22.20.0`、npm `10.9.3`、Python `3.11.9`。项目目录：`D:\桌面文件\AIVoice`。

同日后续已将项目整理为统一根 Git 仓库，关联既有 `cofe-man0525/iphone`，并保留原 mobile Git 元数据。下表“项目结构”为配置工作流时的原始状态；当前仓库布局与上传步骤见 [github-upload.md](github-upload.md)。

## 已完成的本机检查

| 检查 | 结果及范围 |
| --- | --- |
| 项目结构 | 根目录非 Git 仓库，mobile 内有原有 `.git`；新增上传副本脚本，不删除该历史 |
| 原生目录 | 当前 `mobile/ios` 不存在，未在 Windows 创建、删除或覆盖原生目录 |
| npm 锁文件 | `package-lock.json` 为 v3；598 个 resolved 地址改为 npm 官方源，版本、integrity 及依赖关系不变。原锁文件及更新后锁文件分别在 Windows 隔离目录执行 npm ci dry-run，均退出 0；随后在 GitHub macOS 真正执行 npm ci，成功 |
| Expo 最终配置 | `expo config --type public --json` 和 `--type introspect --json` 均退出 0 |
| 项目身份 | Owner `shandexindevelopapp`、slug `ai-voice-changer`、ID `cd4cfc12-db9c-4f1f-99b1-746f5c958901`、Bundle ID `dev.personal.aivoice` 均正确 |
| 权限与能力 | 原有麦克风说明和 expo-audio 插件保留；配置及生成的 iOS entitlements 都为 `{}` |
| 配置保持原样 | 对比本次修改前的 SHA-256：`package.json`、`app.json`、`app.config.ts`、`eas.json` 四个文件全部相同；锁文件严格只变更 registry URL。Expo、React Native、TypeScript 三个包的旧 integrity 与 npm 官方元数据匹配 |
| Expo 依赖 | `npx --no-install expo install --check` 退出 0：Dependencies are up to date |
| TypeScript | `npm run typecheck` 退出 0 |
| 移动端逻辑测试 | `npm test`，6/6 通过 |
| iOS JS/Hermes 导出 | `expo export --platform ios` 成功；1313 个模块，生成约 2.8 MB 的 `.hbc`，23 项资源。仅 JS 打包，不是原生 .app 或 IPA |
| Workflow YAML | PyYAML 解析通过，核对手动触发及 macos-26 runner |
| GitHub workflow 静态检查 | 从 rhysd/actionlint 官方 release 获取 Windows `actionlint 1.7.12`，检查退出 0。未装 ShellCheck / Pyflakes，未把这些检查声称为已执行 |
| Python 语法 | `py_compile` 对新增 Python 脚本检查通过 |
| IPA 规则测试 | 12/12 通过：拒绝 ARM64/x86 模拟器、含模拟器 slice 的通用二进制、损坏 Mach-O、缺失 JS、缺失框架、错误 Bundle ID/平台、不支持的额外 entitlements、错误 Payload 及 ZIP 内损坏内容 |

IPA 规则测试使用的全部是临时合成测试数据，命名为 fixture/zip，测试后清理。它们不是可执行 App，也未作为 IPA 交付。

### iOS 依赖检查范围

检查了 package.json、package-lock.json、app.json、app.config.ts、eas.json，及安装的 Expo SDK 版本对应原生依赖兼容性：

- 核心：Expo `~58.0.23`、React Native `0.88.1`、React `19.3.0`。
- Expo 原生模块：audio `~58.0.11`、asset `~58.0.20`、constants `~58.0.15`、document-picker `~58.0.4`、file-system `~58.0.13`、linking `~58.0.16`、secure-store `~58.0.2`、sharing `~58.0.22`、router `~58.0.30`、status-bar `~58.0.4`。
- 其他原生依赖：slider `5.2.1`、safe-area-context `~5.11.1`、screens `~4.30.1`、svg `15.16.0`。
- 没有新增原生库，也没有升级依赖；仅统一锁文件下载源。Expo SDK 58 官方 Xcode 下限为 26.4；本次选择 Xcode 26.6，并已通过真实云端 Release 编译。

### 已存在的 ESLint 问题

本项目没有提交 ESLint 配置和 lint script。本次用本机已有 ESLint / Expo flat 配置生成**忽略提交的临时配置**，检查 `app` 与 `src`，退出 1：**3 个错误，7 个警告**。没有自动安装依赖或改动 package.json。

- `mobile/app/(tabs)/index.tsx`：第 66 行 `react-hooks/set-state-in-effect`；第 148 行 `react-hooks/refs`。
- `mobile/app/(tabs)/settings.tsx`：第 15 行 `react-hooks/set-state-in-effect`。
- 其余警告涉及上述录音页、`src/StudioContext.tsx` 的 effect 依赖和 `src/ui.tsx` 的未使用导入。

这些属于原业务代码，本次用户要求不重构现有功能，故仅记录。CI 未新增一个会自动安装 ESLint 或因这些旧问题停止编译的步骤；仍执行 TypeScript 和逻辑测试。此处不能报告“所有检查全部通过”。

本机证据保存在忽略提交的 `.runtime/ios-ci/`，包括修改前配置哈希、public/introspect 配置、npm dry-run 日志、lint 日志和 JS 导出日志。上传副本脚本将生成逐文件 SHA-256 清单，便于发布前复核。

## 真实云端编译结果

完整源码已推送到现有 `cofe-man0525/iphone` 的 `main`，保留原始 README 提交。首次真实运行 [Actions #1](https://github.com/cofe-man0525/iphone/actions/runs/42486697033) 中，Xcode / iphoneos SDK 检查、真正的 macOS `npm ci`、TypeScript、6 项逻辑测试、12 项 IPA 规则测试均通过。Prebuild 因 `--no-install` 与 `--npm` 参数互斥失败；随后移除多余 `--npm` 并正常提交推送，没有生成或上传假 IPA。

第二次 [Actions #2](https://github.com/cofe-man0525/iphone/actions/runs/42486951928) **真实构建成功**：

- 源码提交：`3e30a571b6bce4cb3cf07af77f3bf164e871010f`。
- 标准 `macos-26` runner；Xcode `26.6`，Build `17F113`，iphoneos SDK `26.5`。
- npm ci、Prebuild、CocoaPods、真机 Release archive、产物验证及 Artifact 上传全部通过。
- Bundle ID：`dev.personal.aivoice`；最低 iOS：`16.4`；平台：`iPhoneOS` / ARM64。
- 9 个原生二进制通过 iOS 平台及无签名检查；`main.jsbundle` 为 2,842,380 字节。
- IPA：`AI-Voice-Changer-unsigned-iphoneos.ipa`，10,109,268 字节。
- SHA-256：`1fd1e3154b3105b6b1990935c462a7d4d670ed91cd62c8462ca8a27857485411`。
- Artifact：`AI-Voice-Changer-unsigned-iphoneos-2`，GitHub 保留到 `2026-11-11 14:08:54 UTC`。
- 已下载到本机 `deliverables/ios/`。在 Windows 再次核对 ZIP 完整性、Payload 结构、Info.plist、9 个实际 Mach-O 二进制、JS Bundle 和 SHA-256，全部通过。本机文件不因 Artifact 链接到期而删除。

## 仍待本人设备验证

1. 用 Windows Sideloadly 和本人免费 Apple ID 重签并安装；未签名 IPA 不能直接作为已签名 App 安装。
2. iPhone 录音、重启恢复、连接 HTTPS 服务器、实际转换、导出及微信 / 抖音接收。

本次没有 Apple 登录，没有创建新的 Expo 项目，没有提交 Apple ID、Token、密码、私钥、模型或录音。GitHub 授权由本机 Git Credential Manager 处理，未写入源码。本次已完成真实原生构建和 IPA 内容验证，尚未进行 iPhone 安装或设备音质验证。

安装步骤见 [ios-install.md](ios-install.md)。
