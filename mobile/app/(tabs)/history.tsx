import React from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { useStudio } from "../../src/StudioContext";
import { Entry, active, clock, statusText } from "../../src/domain";
import { Button, Card, Copy, Page, Player, useColors } from "../../src/ui";
export default function History() {
  const c = useColors(),
    studio = useStudio();
  function remove(entry: Entry) {
    Alert.alert(
      "删除这条录音？",
      "将删除本机文件，并删除关联的服务器任务与文件。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () =>
            void studio
              .remove(entry)
              .catch((e) => Alert.alert("删除失败", e.message)),
        },
      ],
    );
  }
  return (
    <Page
      title="历史记录"
      subtitle={`${studio.entries.length} 条声音，保存在这台设备。`}
    >
      {!studio.entries.length ? (
        <Card>
          <Copy style={{ fontSize: 20, fontWeight: "600" }}>
            第一段声音，还在等你。
          </Copy>
          <Copy muted>录音会自动保存，关闭App后依然可以回来听。</Copy>
          <Button title="去录音" onPress={() => router.push("/")} />
        </Card>
      ) : (
        studio.entries.map((entry) => (
          <Card key={entry.id}>
            <Copy style={{ fontSize: 17, fontWeight: "600" }}>
              {entry.name}
            </Copy>
            <Copy muted style={{ fontSize: 12 }}>
              {new Date(entry.created).toLocaleString("zh-CN")} ·{" "}
              {clock(entry.duration)} · {entry.voiceName || "原声"}
            </Copy>
            <Player title="原声" uri={entry.sourceUri} />
            {entry.outputUri && (
              <Player
                title={`变声结果 · ${entry.format.toUpperCase()}`}
                uri={entry.outputUri}
              />
            )}
            <Copy muted>{statusText[entry.status]}</Copy>
            {entry.error && <Copy style={{ color: c.red }}>{entry.error}</Copy>}
            {active(entry.status) ? (
              <Button
                title="取消任务"
                secondary
                onPress={() =>
                  void studio
                    .cancel(entry)
                    .catch((e) => Alert.alert("取消失败", e.message))
                }
              />
            ) : (
              <>
                <Button
                  title={entry.outputUri ? "分享变声结果" : "分享原声"}
                  icon="share"
                  onPress={() =>
                    void studio
                      .share(entry, !entry.outputUri)
                      .catch((e) => Alert.alert("分享失败", e.message))
                  }
                />
                <Button
                  title="使用当前音色重新转换"
                  secondary
                  disabled={!studio.voice}
                  onPress={() =>
                    void studio
                      .convert(entry)
                      .catch((e) => Alert.alert("转换失败", e.message))
                  }
                />
                <Button
                  title="删除这条录音"
                  secondary
                  onPress={() => remove(entry)}
                />
              </>
            )}
          </Card>
        ))
      )}
    </Page>
  );
}
