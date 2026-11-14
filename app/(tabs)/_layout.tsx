// Tabs: LOG · BODY · TRAIN · LIFE, reached from NavOrb's one circle (no bar).
// BODY is `index`, so the app opens on it.
// habits/activity/progress stay registered (reachable via router.push —
// habits and progress from LIFE, activity from TRAIN) but aren't on the
// circle's menu: NavOrb only draws its own PLACES.
import { Tabs } from 'expo-router';
import { NavOrb } from '@/components/NavOrb';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={props => <NavOrb {...props} />}
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
