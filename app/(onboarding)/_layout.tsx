import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="basics" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="targets" />
      <Stack.Screen name="first-habit" />
      <Stack.Screen name="skills" />
      <Stack.Screen name="book" />
      <Stack.Screen name="connect" />
      <Stack.Screen name="account" />
      <Stack.Screen name="briefing-builder" />
    </Stack>
  );
}
