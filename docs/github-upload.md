# GitHub 完整项目与 iOS 构建

本地根目录：`D:\桌面文件\AIVoice`。

现有仓库：[cofe-man0525/iphone](https://github.com/cofe-man0525/iphone)，分支 `main`。上传范围包含 `mobile`、`backend`、`ai-service`、`scripts`、`docs`、`design-system` 与 `.github` 的项目源码。运行环境、依赖、模型、个人音频、Token、签名文件和编译产物不会提交。

## Git 仓库整理

原来仅 `mobile` 有一份独立 Git 元数据，项目根目录没有仓库。为让完整项目正常提交，将旧 `mobile/.git` 原样保存在忽略提交的 `.runtime/git-backups/`，43 个元数据文件逐一校验 SHA-256；没有删除原记录或业务源码。

项目根部已初始化统一 Git 仓库，`origin` 指向上述既有仓库。以远程已有的 `f19fb80` README 初始提交为基础追加项目，不使用 force push，不重写远程历史。原 README 的说明为“用于在云端存储对应的苹果的数据。”，可在该初始提交中查看。

此电脑浏览器使用现有本机代理 `127.0.0.1:7897`。Git 直连 GitHub 曾超时，因此仅在本仓库的本地 Git 配置中为 GitHub 设置该代理，没有修改系统或全局代理。该设置不随源码提交；若以后关闭代理，按实际网络情况调整本仓库配置。

## 后续上传更新

在项目根目录进行 Git 操作，`mobile` 现在属于统一根仓库，无需上传另一个移动端副本。

```powershell
Set-Location 'D:\桌面文件\AIVoice'
git status
git add .
git diff --cached --stat
git commit -m "Update AI Voice Changer"
git pull --rebase origin main
git push origin main
```

提交前检查暂存区。不要使用 `git add -f` 把被忽略的模型、私密配置和个人音频加进来。GitHub 授权在 Git Credential Manager 打开的浏览器里自行完成；不把密码或 Token 放进源码、命令参数、截图或聊天。

## 手动编译及下载

1. 打开 [仓库 Actions](https://github.com/cofe-man0525/iphone/actions)。
2. 选择 **iOS Unsigned IPA (Sideloadly)**。
3. 点击 **Run workflow**，选择 `main`，再点击运行按钮。
4. 等待真正的 macOS 运行结果；首次下载 CocoaPods 和编译可能较久。
5. 成功后，在该次运行页面底部 **Artifacts** 下载 `AI-Voice-Changer-unsigned-iphoneos-运行编号`。
6. 解压下载的外层 ZIP，取得 `.ipa`、`validation.json` 和 `SHA256SUMS.txt`。
7. USB 连接 iPhone，把 `.ipa` 拖入 Windows Sideloadly；Apple ID、密码及验证码只在本机填写，按提示重签安装。

不需要额外 GitHub Secrets 或付费 Apple 开发者会员来执行未签名构建。公开仓库标准 runner 的计算与私有仓库额度、Artifact 存储的区别，及免费 Apple ID 的刷新要求，见 [完整安装指南](ios-install.md)。

工作流只手动触发，推送源码不会自动启动 macOS 编译。**仓库上传、静态检查通过不等于云端编译成功；以 GitHub Actions 真实日志及下载产物为准。**
