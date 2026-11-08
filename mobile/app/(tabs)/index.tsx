import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { router, useFocusEffect } from "expo-router";
import { useStudio } from "../../src/StudioContext";
import { active, clock, statusText } from "../../src/domain";
import {
  Button,
  Card,
  Copy,
  Icon,
  Page,
  Player,
  useColors,
} from "../../src/ui";
export default function Recorder() {
  const c = useColors();
  const studio = useStudio();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 150);
  const [starting, setStarting] = useState(false),
    [notice, setNotice] = useState(""),
    [levels, setLevels] = useState<number[]>([]),
    [currentId, setCurrentId] = useState<string | null>(null);
  const session = useRef(false),
    stopping = useRef(false),
    duration = useRef(0),
    stopRef = useRef<(reason?: string) => Promise<void>>(async () => {});
  useFocusEffect(
    useCallback(
      () => () => {
        if (session.current) void stopRef.current("页面已切换，录音已保存。");
      },
      [],
    ),
  );
  const current =
    studio.entries.find((e) => e.id === currentId) || studio.entries[0];
  const busy = !!current && active(current.status);
  function fail(error: unknown) {
    Alert.alert(
      "没有完成",
      error instanceof Error ? error.message : String(error),
    );
  }
  useEffect(() => {
    duration.current = Math.max(duration.current, state.durationMillis / 1000);
    if (state.isRecording)
      setLevels((old) => [
        ...old.slice(-31),
        Math.max(0.05, Math.min(1, ((state.metering ?? -60) + 60) / 60)),
      ]);
    if (session.current && state.durationMillis >= 59500)
      void stopRef.current("已达到60秒，录音已保存。");
  }, [state.durationMillis]);
  useEffect(() => {
    if (
      session.current &&
      !state.isRecording &&
      !starting &&
      state.durationMillis > 300
    )
      void stopRef.current("音频会话中断，已尝试保留录音。");
  }, [state.isRecording]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && session.current)
        void stopRef.current("应用进入后台，已保存这段录音。");
    });
    return () => {
      sub.remove();
      if (session.current) void stopRef.current("页面已关闭，录音已保存。");
    };
  }, []);
  async function start() {
    setStarting(true);
    setNotice("");
    studio.player.pause();
    try {
      if (Platform.OS === "web")
        throw new Error("此预览仅用于界面检查；请在原生iPhone构建中录音。");
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error("请在iPhone设置中允许麦克风权限。");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      await recorder.prepareToRecordAsync();
      duration.current = 0;
      setLevels([]);
      session.current = true;
      recorder.record({ forDuration: 60 });
    } catch (e) {
      session.current = false;
      fail(e);
    } finally {
      setStarting(false);
    }
  }
  async function stop(reason = "") {
    if (stopping.current || !session.current) return;
    stopping.current = true;
    session.current = false;
    try {
      if (state.isRecording) {
        try {
          await recorder.stop();
        } catch (error) {
          if (!recorder.uri) throw error;
        }
      }
      const uri = recorder.uri;
      if (!uri) throw new Error("录音中断且未产生文件，请重试。");
      if (duration.current < 0.25)
        throw new Error("录音太短，请至少说一句话。");
      const entry = await studio.saveRecording(uri, duration.current);
      setCurrentId(entry.id);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => {});
      setNotice(reason || "原声已保存在本机，选好音色就可以转换。");
    } catch (e) {
      fail(e);
    } finally {
      stopping.current = false;
    }
  }
  stopRef.current = stop;
  return (
    <Page title="让声音，多一种可能。" subtitle="录下一句话，留住你的表达。">
      {Platform.OS === "web" && (
        <Copy muted>
          开发者界面预览 · 原生录音与文件能力请在iPhone构建中验证。
        </Copy>
      )}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Copy muted style={{ fontSize: 13 }}>
            你的录音室
          </Copy>
          <Copy muted style={{ fontSize: 13 }}>
            最长60秒
          </Copy>
        </View>
        <Text
          style={{
            fontSize: 52,
            fontWeight: "300",
            fontVariant: ["tabular-nums"],
            textAlign: "center",
            color: c.text,
            marginTop: 8,
          }}
        >
          {clock(
            state.isRecording
              ? state.durationMillis / 1000
              : current?.duration || 0,
          )}
        </Text>
        <View
          accessibilityLabel={state.isRecording ? "实时录音电平" : "录音待机"}
          style={{
            height: 48,
            flexDirection: "row",
            gap: 4,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {Array.from({ length: 32 }, (_, i) => (
            <View
              key={i}
              style={{
                width: 3,
                borderRadius: 3,
                height: state.isRecording
                  ? Math.max(3, (levels[i] || 0.05) * 44)
                  : 3,
                backgroundColor: state.isRecording ? c.red : c.line,
              }}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.isRecording ? "停止录音" : "开始录音"}
          disabled={starting || busy}
          onPress={() => void (state.isRecording ? stop() : start())}
          style={({ pressed }) => ({
            width: 108,
            height: 108,
            borderRadius: 54,
            backgroundColor: c.soft,
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
            opacity: busy ? 0.4 : pressed ? 0.7 : 1,
            marginVertical: 8,
          })}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: c.red,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {starting ? (
              <ActivityIndicator color={c.card} />
            ) : (
              <Icon
                name={state.isRecording ? "stop" : "mic"}
                color={c.card}
                size={34}
              />
            )}
          </View>
        </Pressable>
        <Copy style={{ textAlign: "center", fontWeight: "600" }}>
          {state.isRecording
            ? "轻点结束录音"
            : current
              ? "轻点重新录音"
              : "轻点开始录音"}
        </Copy>
        <Copy muted style={{ fontSize: 13, textAlign: "center" }}>
          原声自动保存，转换前不会上传。
        </Copy>
      </Card>
      {notice && <Copy muted>{notice}</Copy>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="选择目标音色"
        onPress={() => router.push("/voices")}
        style={({ pressed }) => ({
          padding: 20,
          borderRadius: 20,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{ backgroundColor: c.soft, borderRadius: 14, padding: 12 }}
        >
          <Icon name="wave" color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Copy style={{ fontWeight: "600" }}>
            {studio.voice?.name || "选择目标音色"}
          </Copy>
          <Copy muted style={{ fontSize: 13 }}>
            {studio.voice ? "已连接你的授权参考录音" : "先导入一段授权参考录音"}
          </Copy>
        </View>
        <Icon name="arrow" color={c.muted} />
      </Pressable>
      {current && (
        <Card>
          <Copy style={{ fontWeight: "600" }}>原声与结果</Copy>
          <Player uri={current.sourceUri} title="我的原声" />
          {current.outputUri && (
            <Player
              uri={current.outputUri}
              title={`AI结果 · ${current.voiceName}`}
            />
          )}
          <Copy muted>{statusText[current.status]}</Copy>
          {current.error && (
            <Copy style={{ color: c.red }}>{current.error}</Copy>
          )}
          {busy ? (
            <>
              <ActivityIndicator color={c.accent} />
              <Button
                title="取消任务"
                secondary
                onPress={() => void studio.cancel(current).catch(fail)}
              />
            </>
          ) : (
            <Button
              title={current.outputUri ? "换个音色，再转换" : "开始 AI 变声"}
              disabled={!studio.voice || state.isRecording}
              onPress={() => {
                setCurrentId(null);
                void studio.convert(current).catch(fail);
              }}
            />
          )}
          <Button
            title={current.outputUri ? "保存或分享结果" : "保存或分享原声"}
            icon="share"
            secondary
            disabled={busy || state.isRecording}
            onPress={() =>
              void studio.share(current, !current.outputUri).catch(fail)
            }
          />
        </Card>
      )}
      <Copy muted style={{ fontSize: 12 }}>
        AI转换使用你设置的服务器。系统分享能否发送到微信或抖音，以接收应用实际支持为准。
      </Copy>
    </Page>
  );
}
