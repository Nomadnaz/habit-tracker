// One header for every pushed screen and modal: a round back (or close)
// button, the title in the dot face, and round action buttons on the right.
// Tab roots keep their own big eyebrow + title header.
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

export function ScreenHeader({ title, close, onBack, right }: {
  title: string;
  /** Modals close (×); pushed screens go back (‹). */
  close?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <HeaderIcon icon={close ? 'close' : 'chevron-left'} onPress={onBack ?? (() => router.back())} label={close ? 'Close' : 'Back'} />
      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
      {right && <View style={styles.right}>{right}</View>}
    </View>
  );
}

export function HeaderIcon({ icon, onPress, label }: { icon: Icon; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={19} color={C.ink} />
    </Pressable>
  );
}

/** A text action in the header, e.g. EDIT / DONE. `on` inverts it. */
export function HeaderPill({ label, onPress, on }: { label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && styles.pressed]}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  title: { flex: 1, fontFamily: F.dot, fontSize: 24, color: C.ink, letterSpacing: 1.5 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: C.raised },
  pill: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.hot, borderColor: C.hot },
  pillText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  pillTextOn: { color: C.onHot },
});
