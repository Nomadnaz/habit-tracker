// The one dropdown: a slim row with a label, what's inside summed up on the
// right and a chevron that turns; tap to open the body under it. Works on its
// own or controlled (`open` + `onToggle`).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';

export function Dropdown({ label, summary, open: shown, onToggle, initiallyOpen, children, style }: {
  label: string;
  summary?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  initiallyOpen?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [own, setOwn] = useState(!!initiallyOpen);
  const open = shown ?? own;
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => { Animated.spring(turn, { toValue: open ? 1 : 0, friction: 7, tension: 120, useNativeDriver: true }).start(); }, [open]);

  const toggle = () => {
    void Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    if (shown == null) setOwn(!open);
    onToggle?.(!open);
  };
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={[st.box, open && st.boxOpen, style]}>
      <Pressable onPress={toggle} style={st.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={st.label}>{label}</Text>
        <View style={st.summary}>
          {typeof summary === 'string' ? <Text style={st.summaryText} numberOfLines={1}>{summary}</Text> : summary}
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <MaterialCommunityIcons name="chevron-down" size={16} color={open ? C.live : C.dim} />
        </Animated.View>
      </Pressable>
      {open && <View style={st.body}>{children}</View>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.bg, overflow: 'hidden' },
  boxOpen: { borderColor: C.lineHi },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingHorizontal: 12 },
  label: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 2 },
  summary: { flex: 1, alignItems: 'flex-end' },
  summaryText: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1 },
  body: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
});
