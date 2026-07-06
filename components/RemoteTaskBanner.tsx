// ─────────────────────────────────────────────────────────────────────────
// components/RemoteTaskBanner.tsx — in-app "task arrived from your device" toast
//
// Mounted once at the app root (app/_layout.tsx). Listens for the
// TASKS_REMOTE_ADDED_EVENT emitted by useRemoteTaskSync when a NEW task arrives
// live from outside the app (e.g. the voice device), then buzzes the phone and
// slides a small banner down from the top for a few seconds.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  TASKS_REMOTE_ADDED_EVENT,
  type RemoteTaskAdded,
} from '@/lib/use-remote-task-sync';

const ORANGE = '#FF4D00';
const INK = '#1A1714';
const MUTED = '#8C857B';
const CARD = '#FCFBF9';
const BORDER = '#E5E1DA';
const VISIBLE_MS = 3800;

export function RemoteTaskBanner() {
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (detail: RemoteTaskAdded) => {
      setLabel(detail.label);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 8,
        speed: 14,
      }).start();

      hideTimer.current = setTimeout(dismiss, VISIBLE_MS);
    };

    const sub = DeviceEventEmitter.addListener(TASKS_REMOTE_ADDED_EVENT, show);
    return () => {
      sub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const dismiss = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(translateY, {
      toValue: -160,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setLabel(null));
  };

  if (!label) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8, transform: [{ translateY }] }]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={dismiss} style={styles.card}>
        <MaterialCommunityIcons name="bell-ring-outline" size={20} color={ORANGE} />
        <Text style={styles.body} numberOfLines={2}>
          <Text style={styles.title}>New task from your device{'\n'}</Text>
          <Text style={styles.label}>{label}</Text>
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      default: {},
    }),
  },
  body: { flex: 1 },
  title: { fontFamily: 'PixeloidSans_700Bold', fontSize: 11, color: MUTED },
  label: { fontFamily: 'PixeloidSans_700Bold', fontSize: 14, color: INK },
});
