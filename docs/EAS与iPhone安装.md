# Windows 开发与独立 iPhone 安装

本项目使用 Expo SDK 58、React Native 0.88.1 和 Expo Router。所有原生模块均通过 `expo install` 选择当前SDK兼容版本。Preview 是 Release、`developmentClient: false` 的独立应用，JS随IPA打包，不需要电脑上的Metro才能启动。

## 关联已经存在的项目

本地slug固定为 `ai-voice-changer`。不要创建新云端项目。

1. 在Expo后台打开你已创建的 AI Voice Changer 项目，复制 Project ID（UUID）和Owner。
2. 将 `mobile/.env.example` 复制为 `mobile/.env`，填写准确的 `EXPO_PROJECT_ID`、`EXPO_OWNER` 和由你确认可用的 `AIVOICE_IOS_BUNDLE_IDENTIFIER`。
3. 不要直接使用默认预览值 `dev.personal.aivoice` 当成你已拥有的标识。Bundle ID例如 `com.你的标识.aivoice`，每段需为合法英文字母/数字格式。
4. 在PowerShell中进入 `D:\桌面文件\AIVoice\mobile`。执行：

```powershell
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest init --id 从后台复制的准确ProjectID
npx eas-cli@latest project:info
```

检查 `project:info` 的项目名、Owner、Project ID是否与你后台一致。如果CLI询问创建新项目，退出并检查ID与账号，不要继续创建。

动态配置只在提供ID后写入 `extra.eas.projectId`。本地代码不会自动创建或猜测云端项目。若CLI尝试改写动态配置而失败，将它显示的既有UUID写入 `.env`，然后再次查看 `project:info`。

## 苹果签名条件

独立Ad Hoc安装需要有效的Apple Developer付费会员、iPhone的UDID登记、发行证书和Ad Hoc Provisioning Profile。仅注册Expo账号不等于拥有苹果签名资格。

没有这些条件时，源代码、配置和自动化测试仍能完成；不能得到可安装到真实iPhone的已签名IPA。Expo Go仅可作为临时开发辅助，不是最终交付。

## 云端构建

为了让EAS远端也获得非秘密的项目配置，请在Expo项目的preview环境中配置这三个变量，或在EAS CLI环境管理中创建它们：

- `EXPO_PROJECT_ID`
- `EXPO_OWNER`
- `AIVOICE_IOS_BUNDLE_IDENTIFIER`

API Token不应写入构建变量或App源码；用户在安装后于设置页输入，使用iOS Keychain / expo-secure-store存储。

```powershell
npm run typecheck
npm test
npx expo-doctor
npx expo export --platform ios --output-dir ../.runtime/ios-bundle
npm run check:build
npx eas-cli@latest device:create
# 回到项目根目录运行受保护构建入口
../scripts/build-ios.ps1
```

构建时按EAS提示由你本人完成苹果账号登录和签名操作。不要把苹果账号密码交给开发助手。新增设备后需重新构建或重签包含新UDID的安装包。

`eas-build-pre-install`会在云端依赖安装前检查项目UUID、明确配置的Bundle ID及HTTPS要求。Preview不打开全局HTTP例外。Windows上 `expo prebuild --platform ios` 会跳过iOS生成，这是平台限制；EAS会在云端macOS进行原生编译。

## 安装与首次使用

1. 构建成功后，用已登记的iPhone打开EAS给出的内部安装链接并安装IPA。
2. 打开App，填写部署后的HTTPS API地址和 `AIVOICE_API_TOKEN`，测试连接。
3. 点击圆形录音按钮，允许麦克风权限，录一段话，再停止。原声自动写入App文稿目录。
4. 在音色库添加有权使用的3–25秒参考语音，确认授权，试听后选择。
5. 返回录音页开始AI变声。完成后比较原声与结果，点击“保存或分享结果”。
6. 在iOS分享面板选择“存储到‘文件’”。微信、抖音是否出现在面板、是否接收文件，需要在你的设备上验证。

请按 `真机测试清单.md` 逐项记录。当前没有iPhone实测结果时，不标记为通过。

官方依据：[Expo内部发行](https://docs.expo.dev/build/internal-distribution/)、[expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/)、[Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)。
