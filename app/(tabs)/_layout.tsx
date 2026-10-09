// Bottom tabs: TODAY · BODY · [PUCK] · TRAIN · LIFE, drawn by PuckTabBar.
// habits/health/activity/progress/profile stay registered (their files still
// exist and are reachable via router.push — habits from LIFE, health's cards
// from BODY) but have no bar slot: the custom bar only draws TAB_ORDER.
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
      <Tabs.Screen name="index" />
      <Tabs.Screen name="body" />
      <Tabs.Screen name="gym" />
      <Tabs.Screen name="life" />
      <Tabs.Screen name="habits" options={{ href: null }} />
      <Tabs.Screen name="health" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="progress" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
