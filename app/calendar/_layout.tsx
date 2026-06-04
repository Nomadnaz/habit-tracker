import { Stack } from 'expo-router';

/** Calendar modal contains its own stack so day view can push on top reliably. */
export default function CalendarLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="day" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
