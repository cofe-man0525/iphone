import { Tabs } from "expo-router";
import { Icon, useColors } from "../../src/ui";
export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarHideOnKeyboard: true,
      }}
    >
      {[
        { name: "index", title: "录音", icon: "mic" },
        { name: "voices", title: "音色库", icon: "library" },
        { name: "history", title: "历史", icon: "history" },
        { name: "settings", title: "设置", icon: "settings" },
      ].map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => (
              <Icon name={tab.icon} color={String(color)} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
