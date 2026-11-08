import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import * as Picker from "expo-document-picker";
import { useStudio } from "../../src/StudioContext";
import { categories } from "../../src/domain";
import * as api from "../../src/api";
import {
  Button,
  Card,
  Copy,
  Icon,
  Page,
  Player,
  useColors,
} from "../../src/ui";
export default function Voices() {
  const c = useColors(),
    studio = useStudio();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [category, setCategory] = useState("自定义音色"),
    [authorized, setAuthorized] = useState(false),
    [file, setFile] = useState<{
      uri: string;
      name: string;
      mime: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previews, setPreviews] = useState<Record<string, string>>({});
  async function choose() {
    try {
      const result = await Picker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        if ((asset.size || 0) > 20 * 1024 * 1024)
          throw new Error("参考音频不能超过20MB。");
        setFile({
          uri: asset.uri,
          name: asset.name,
          mime: asset.mimeType || "application/octet-stream",
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }
  async function save() {
    if (!file || !authorized || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.addVoice(studio.connection, file, name.trim(), category);
      await studio.refreshVoices();
      setOpen(false);
      setFile(null);
      setName("");
      setAuthorized(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function remove(id: string) {
    Alert.alert(
      "删除参考音色？",
      "已生成的历史结果会保留，后续无法再选择该音色。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () =>
            void api
              .deleteVoice(studio.connection, id)
              .then(() => studio.refreshVoices())
              .catch((e) => Alert.alert("删除失败", e.message)),
        },
      ],
    );
  }
  return (
    <Page
      title="音色库"
      subtitle="一种音色，一种新的表达。"
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加授权音色"
          onPress={() => {
            setError("");
            setOpen(true);
          }}
          style={{ padding: 12, borderRadius: 16, backgroundColor: c.soft }}
        >
          <Icon name="plus" color={c.accent} />
        </Pressable>
      }
    >
      <Copy muted>
        只有实际导入的授权参考录音可参与转换。建议3–25秒，单人、清晰、少背景音乐。
      </Copy>
      {studio.voiceList.map((voice) => (
        <Card key={voice.id}>
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <View
              style={{ backgroundColor: c.soft, padding: 14, borderRadius: 18 }}
            >
              <Icon name="wave" color={voice.available ? c.accent : c.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Copy style={{ fontSize: 18, fontWeight: "600" }}>
                {voice.name}
              </Copy>
              <Copy muted style={{ fontSize: 13 }}>
                {voice.category} · {voice.available ? "可用" : "待添加参考录音"}
              </Copy>
            </View>
            {studio.voice?.id === voice.id && (
              <Icon name="check" color={c.accent} />
            )}
          </View>
          <Copy muted style={{ fontSize: 14 }}>
            {voice.description}
          </Copy>
          {voice.previewUrl &&
            (previews[voice.id] ? (
              <Player uri={previews[voice.id]} title="参考录音" />
            ) : (
              <Button
                title="试听参考音色"
                secondary
                onPress={() =>
                  void api
                    .previewVoice(studio.connection, voice.id)
                    .then((uri) =>
                      setPreviews((old) => ({ ...old, [voice.id]: uri })),
                    )
                    .catch((e) => Alert.alert("试听失败", e.message))
                }
              />
            ))}
          <Button
            title={studio.voice?.id === voice.id ? "已选中" : "选择音色"}
            secondary={studio.voice?.id !== voice.id}
            disabled={!voice.available}
            onPress={() => studio.selectVoice(voice)}
          />
          {voice.custom && (
            <Button
              title="删除参考音色"
              secondary
              onPress={() => remove(voice.id)}
            />
          )}
        </Card>
      ))}
      <Button
        title="刷新音色库"
        secondary
        onPress={() =>
          void studio
            .refreshVoices()
            .catch((e) => Alert.alert("连接提示", e.message))
        }
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingTop: 40, gap: 18 }}
            keyboardShouldPersistTaps="handled"
          >
            <Copy style={{ fontSize: 26, fontWeight: "700" }}>
              添加参考音色
            </Copy>
            <Copy muted>
              请仅使用你本人或已获得授权的声音。录音会上传并保存在你连接的服务器。
            </Copy>
            <Copy>音色名称</Copy>
            <TextInput
              accessibilityLabel="音色名称"
              value={name}
              maxLength={40}
              onChangeText={setName}
              placeholder="例如：我的参考声音"
              placeholderTextColor={c.muted}
              style={{
                padding: 16,
                borderRadius: 16,
                color: c.text,
                backgroundColor: c.card,
              }}
            />
            <Copy>分类</Copy>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {categories.map((item) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: item === category }}
                  key={item}
                  onPress={() => setCategory(item)}
                  style={{
                    padding: 12,
                    minHeight: 44,
                    borderRadius: 12,
                    backgroundColor: item === category ? c.soft : c.card,
                  }}
                >
                  <Copy style={{ fontSize: 13 }}>{item}</Copy>
                </Pressable>
              ))}
            </View>
            <Button
              title={file ? file.name : "选择参考音频"}
              secondary
              onPress={() => void choose()}
            />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
            >
              <Switch
                accessibilityLabel="我拥有使用该参考录音的权利"
                value={authorized}
                onValueChange={setAuthorized}
              />
              <Copy style={{ flex: 1, fontSize: 14 }}>
                我拥有使用该参考录音的权利。
              </Copy>
            </View>
            {error && <Copy style={{ color: c.red }}>{error}</Copy>}
            <Button
              title="上传并添加"
              onPress={() => void save()}
              loading={busy}
              disabled={!file || !authorized || !name.trim()}
            />
            <Button
              title="取消"
              secondary
              disabled={busy}
              onPress={() => setOpen(false)}
            />
          </ScrollView>
        </View>
      </Modal>
    </Page>
  );
}
