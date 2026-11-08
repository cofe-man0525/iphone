import { ExpoConfig, ConfigContext } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const extra = config.extra ?? {};
  const eas = extra.eas ?? {};
  const projectId = eas.projectId ?? process.env.EXPO_PROJECT_ID?.trim();
  if (
    projectId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId,
    )
  )
    throw new Error("EXPO_PROJECT_ID 必须是已有项目的准确UUID。");
  return {
    ...config,
    name: "AI 变声器",
    slug: "ai-voice-changer",
    version: "1.0.0",
    scheme: "aivoice",
    orientation: "default",
    userInterfaceStyle: "automatic",
    owner: config.owner || process.env.EXPO_OWNER || "shandexindevelopapp",
    ios: {
      supportsTablet: false,
      bundleIdentifier:
        process.env.AIVOICE_IOS_BUNDLE_IDENTIFIER || "dev.personal.aivoice",
      infoPlist: {
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
        NSMicrophoneUsageDescription:
          "用于录制你自己的语音，在你选择转换时发送至你的变声服务器。",
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: process.env.AIVOICE_ALLOW_LOCAL_HTTP === "1",
        },
      },
    },
    plugins: [
      [
        "expo-audio",
        {
          microphonePermission: "允许AI变声器录制你的语音。",
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false,
        },
      ],
      "expo-router",
      ["expo-secure-store", { faceIDPermission: false }],
      "expo-asset",
    ],
    extra: {
      ...extra,
      eas: {
        ...eas,
        ...(projectId ? { projectId } : {}),
      },
    },
    experiments: { typedRoutes: false },
    web: { bundler: "metro", output: "single" },
  };
};
