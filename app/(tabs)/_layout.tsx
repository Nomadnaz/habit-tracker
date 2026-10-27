// Bottom tabs: LOG · BODY · TRAIN · LIFE, drawn by PuckTabBar.
// BODY is `index`, so the app opens on it.
// habits/activity/progress stay registered (reachable via router.push —
// habits and progress from LIFE, activity from TRAIN) but have no bar slot:
// the custom bar only draws TAB_ORDER.
import { Tabs } from 'expo-router';
import { PuckTabBar } from '@/components/PuckTabBar';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={props => <PuckTabBar {...props} />}
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}
    >
      <Tabs.Screen name="log" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="gym" />
      <Tabs.Screen name="life" />
      <Tabs.Screen name="habits" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="progress" options={{ href: null }} />
    </Tabs>
  );
}
