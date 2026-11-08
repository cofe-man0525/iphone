import React, { useEffect, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useStudio } from "../../src/StudioContext";
import { Format, Settings, normalizeUrl } from "../../src/domain";
import * as api from "../../src/api";
import { Button, Card, Copy, Page, useColors } from "../../src/ui";
export default function Preferences() {
  const c = useColors(),
    studio = useStudio();
  const [draft, setDraft] = useState(studio.settings),
    [key, setKey] = useState(studio.token),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setDraft(studio.settings);
    setKey(studio.token);
  }, [studio.settings, studio.token]);
  async function save(test = false) {
    setBusy(true);
    setNotice("");
    try {
      const settings = { ...draft, url: normalizeUrl(draft.url, __DEV__) };
      if (!key.trim()) throw new Error("请填写服务器配置的API Token。");
      const result = test
        ? await api.health({ settings, token: key.trim() })
        : undefined;
      await studio.saveSettings(settings, key.trim());
      setNotice(
        result
          ? `业务服务已连接。${result.ai.ready ? "AI模型已就绪。" : "AI尚未就绪：" + (result.ai.error || "请检查推理服务。")}`
          : "设置已保存，Token已写入设备安全存储。",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    Alert.alert(
      "清理全部历史？",
      "将删除所有本机录音、变声结果与关联服务器任务。此操作无法撤销。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清理",
          style: "destructive",
          onPress: () =>
            void studio
              .clear()
              .then(() => setNotice("历史记录已清理。"))
              .catch((e) => Alert.alert("清理失败", e.message)),
        },
      ],
    );
  }
  const inputStyle = {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    color: c.text,
    backgroundColor: c.bg,
    fontSize: 15,
  };
  return (
    <Page title="设置" subtitle="连接你的服务，管理自己的声音。">
      <Card>
        <Copy style={{ fontSize: 19, fontWeight: "600" }}>服务器连接</Copy>
        <Copy muted style={{ fontSize: 13 }}>
          录音仅在开始AI转换时上传至下方服务。请使用HTTPS地址。
        </Copy>
        <Copy>服务器 API 地址</Copy>
        <TextInput
          accessibilityLabel="服务器API地址"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={draft.url}
          onChangeText={(url) => setDraft((v) => ({ ...v, url }))}
          placeholder="https://你的域名"
          placeholderTextColor={c.muted}
          style={inputStyle}
        />
        <Copy>API Token</Copy>
        <TextInput
          accessibilityLabel="API Token"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={key}
          onChangeText={setKey}
          placeholder="与后端配置保持一致"
          placeholderTextColor={c.muted}
          style={inputStyle}
        />
        <Button
          title="测试连接并保存"
          onPress={() => void save(true)}
          loading={busy}
        />
        <Button
          title="仅保存设置"
          secondary
          onPress={() => void save()}
          disabled={busy}
        />
        {notice && <Copy accessibilityLiveRegion="polite">{notice}</Copy>}
      </Card>
      <Card>
        <Copy style={{ fontSize: 19, fontWeight: "600" }}>输出与外观</Copy>
        <Copy>默认输出格式</Copy>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {(["m4a", "wav"] as Format[]).map((format) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.format === format }}
              key={format}
              onPress={() => setDraft((v) => ({ ...v, format }))}
              style={{
                flex: 1,
                padding: 16,
                borderRadius: 14,
                backgroundColor: draft.format === format ? c.soft : c.bg,
              }}
            >
              <Copy style={{ textAlign: "center" }}>
                {format.toUpperCase()}
              </Copy>
            </Pressable>
          ))}
        </View>
        <Copy muted style={{ fontSize: 13 }}>
          M4A体积更小；WAV体积更大。保存和分享使用真实对应格式。
        </Copy>
        <Copy>外观</Copy>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(
            [
              { id: "system", name: "跟随系统" },
              { id: "light", name: "浅色" },
              { id: "dark", name: "深色" },
            ] as { id: Settings["theme"]; name: string }[]
          ).map((theme) => (
            <Pressable
              key={theme.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.theme === theme.id }}
              onPress={() => setDraft((v) => ({ ...v, theme: theme.id }))}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 14,
                backgroundColor: draft.theme === theme.id ? c.soft : c.bg,
              }}
            >
              <Copy style={{ fontSize: 13, textAlign: "center" }}>
                {theme.name}
              </Copy>
            </Pressable>
          ))}
        </View>
        <Button
          title="保存输出与外观"
          secondary
          onPress={() =>
            void studio
              .saveSettings(
                {
                  ...studio.settings,
                  format: draft.format,
                  theme: draft.theme,
                },
                studio.token,
              )
              .then(() => setNotice("输出与外观已保存。"))
              .catch((e) => Alert.alert("保存失败", e.message))
          }
        />
      </Card>
      <Card>
        <Copy style={{ fontSize: 19, fontWeight: "600" }}>存储管理</Copy>
        <Copy muted>
          历史音频保存在应用文稿目录。卸载App可能清除这些文件，请先用系统“保存到文件”备份。
        </Copy>
        <Button title="清理全部历史记录" secondary onPress={clear} />
      </Card>
      <Card>
        <Copy style={{ fontSize: 19, fontWeight: "600" }}>关于 AI 变声器</Copy>
        <Copy muted>版本 1.0.0 · Seed-VC参考音色转换</Copy>
        <Copy muted style={{ fontSize: 13 }}>
          微信、抖音的文件接收支持以真机实际结果为准；文件分享不等于原生聊天语音条。
        </Copy>
      </Card>
    </Page>
  );
}
