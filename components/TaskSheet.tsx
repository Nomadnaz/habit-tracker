// NEW / EDIT TASK — a bottom sheet that springs up over TODAY. The name is
// the big field; underneath, four chips (DATE · TIME · PRIORITY · PLACE)
// summarise the task and each opens its own panel below. Tapping outside
// while typing only puts the keyboard away; tapping outside again, the ×, or
// swiping the sheet down closes it. The sheet rides above the keyboard.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import { TimeOfDayWheelPicker } from '@/components/WheelPicker';
import { formatTime12h, type DateOption } from '@/lib/task-schedule';
import type { Priority } from '@/lib/tasks-core';

type Panel = 'date' | 'time' | 'priority' | 'place' | null;
type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PRESETS: { label: string; hour: number; minute: number; icon: Icon }[] = [
  { label: 'MORNING', hour: 9, minute: 0, icon: 'weather-sunset-up' },
  { label: 'NOON', hour: 12, minute: 0, icon: 'white-balance-sunny' },
  { label: 'AFTERNOON', hour: 15, minute: 0, icon: 'weather-partly-cloudy' },
  { label: 'EVENING', hour: 18, minute: 0, icon: 'weather-sunset-down' },
  { label: 'NIGHT', hour: 21, minute: 0, icon: 'weather-night' },
];
const PRIORITIES: { id: Priority; label: string; color: string; note: string }[] = [
  { id: 'HIGH', label: 'HIGH', color: C.alert, note: 'Top of the list' },
  { id: 'MEDIUM', label: 'MEDIUM', color: C.hot, note: 'The default' },
  { id: 'LOW', label: 'LOW', color: C.dim, note: 'Whenever' },
];
// Panels open and close with a bouncy spring on the layout.
const spring = () => LayoutAnimation.configureNext({
  duration: 320,
  create: { type: 'easeInEaseOut', property: 'opacity' },
  update: { type: 'spring', springDamping: 0.72 },
  delete: { type: 'easeInEaseOut', property: 'opacity', duration: 140 },
});

function dayChip(key: string, todayKey: string): { top: string; num: string } {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const diff = Math.round((dt.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  return { top: diff === 0 ? 'TODAY' : diff === 1 ? 'TMRW' : DOW[dt.getDay()], num: String(d) };
}

export function TaskSheet({
  visible, editing, text, onText, dateOptions, todayIndex, dateIndex, onDate, hour, minute, onTime,
  priority, onPriority, location, onLocation, recentLocations, onSubmit, onClose,
}: {
  visible: boolean;
  editing: boolean;
  text: string;
  onText: (t: string) => void;
  dateOptions: DateOption[];
  todayIndex: number;
  dateIndex: number;
  onDate: (i: number) => void;
  hour: number;
  minute: number;
  onTime: (h: number, m: number) => void;
  priority: Priority;
  onPriority: (p: Priority) => void;
  location: string;
  onLocation: (t: string) => void;
  recentLocations: string[];
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel>(null);
  const [keyboard, setKeyboard] = useState(false);
  const y = useRef(new Animated.Value(height)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const input = useRef<TextInput>(null);
  const closing = useRef(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    setPanel(null);
    y.setValue(height);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(y, { toValue: 0, friction: 9, tension: 85, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    if (!editing) setTimeout(() => input.current?.focus(), 160);
  }, [visible]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(y, { toValue: height, duration: 230, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const submit = () => {
    if (!text.trim()) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); input.current?.focus(); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Keyboard.dismiss();
    closing.current = true;
    Animated.parallel([
      Animated.timing(y, { toValue: height, duration: 240, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onSubmit());
  };

  // Drag the sheet down by its top to dismiss.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120 || g.vy > 1.1) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); close(); }
      else Animated.spring(y, { toValue: 0, friction: 7, tension: 120, useNativeDriver: true }).start();
    },
  }), [height]);

  const toggle = (p: Panel) => {
    Haptics.selectionAsync();
    if (p !== 'place') Keyboard.dismiss();
    spring();
    setPanel(cur => (cur === p ? null : p));
  };

  const todayKey = dateOptions[todayIndex]?.key ?? '';
  const dateKey = dateOptions[dateIndex]?.key ?? todayKey;
  const dc = dayChip(dateKey, todayKey);
  const dateLabel = dc.top === 'TODAY' || dc.top === 'TMRW' ? (dc.top === 'TMRW' ? 'TOMORROW' : 'TODAY') : `${dc.top} ${dc.num}`;
  const prio = PRIORITIES.find(p => p.id === priority) ?? PRIORITIES[1];
  const days = dateOptions.slice(todayIndex, todayIndex + 60).map((d, k) => ({ ...d, i: todayIndex + k }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, st.scrim, { opacity: fade }]}>
        {/* Outside: first tap puts the keyboard away, the next one closes. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (keyboard ? Keyboard.dismiss() : close())} />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.kav} pointerEvents="box-none">
        <Animated.View style={[st.sheet, { paddingBottom: Math.max(16, insets.bottom + 8), transform: [{ translateY: y }] }]}>
          <View {...pan.panHandlers} style={st.grab}>
            <View style={st.handle} />
            <View style={st.head}>
              <Text style={st.eyebrow}>{editing ? 'EDIT TASK' : 'NEW TASK'}</Text>
              <Pressable onPress={close} hitSlop={10} style={({ pressed }) => [st.x, pressed && { backgroundColor: C.raised }]} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={18} color={C.dim} />
              </Pressable>
            </View>
          </View>

          <TextInput
            ref={input}
            style={st.name}
            value={text}
            onChangeText={onText}
            placeholder="WHAT NEEDS DOING?"
            placeholderTextColor={C.faint}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            blurOnSubmit
            selectionColor={C.hot}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} keyboardShouldPersistTaps="handled">
            <Chip icon="calendar-blank" label={dateLabel} on={panel === 'date'} onPress={() => toggle('date')} />
            <Chip icon="clock-outline" label={formatTime12h(hour, minute)} on={panel === 'time'} onPress={() => toggle('time')} />
            <Chip icon="flag" label={prio.label} on={panel === 'priority'} tint={prio.color} onPress={() => toggle('priority')} />
            <Chip icon="map-marker-outline" label={location.trim() ? location.trim() : 'PLACE'} on={panel === 'place'} dim={!location.trim()} onPress={() => toggle('place')} />
          </ScrollView>

          {panel && (
            <View style={st.panel}>
              {panel === 'date' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.days} keyboardShouldPersistTaps="handled">
                  {days.map(d => {
                    const on = d.i === dateIndex;
                    const c = dayChip(d.key, todayKey);
                    return (
                      <Pressable key={d.key} onPress={() => { Haptics.selectionAsync(); onDate(d.i); }} style={[st.day, on && st.dayOn]}>
                        <Text style={[st.dayTop, on && { color: C.onHot }, c.top === 'TODAY' && !on && { color: C.live }]}>{c.top}</Text>
                        <Text style={[st.dayNum, on && { color: C.onHot }]}>{c.num}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {panel === 'time' && (
                <View style={{ gap: 10 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
                    {PRESETS.map(p => {
                      const on = p.hour === hour && p.minute === minute;
                      return (
                        <Pressable key={p.label} onPress={() => { Haptics.selectionAsync(); onTime(p.hour, p.minute); }} style={[st.preset, on && st.presetOn]}>
                          <MaterialCommunityIcons name={p.icon} size={15} color={on ? C.onHot : C.ink} />
                          <Text style={[st.presetText, on && { color: C.onHot }]}>{p.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <TimeOfDayWheelPicker
                    hour={hour}
                    minute={minute}
                    onHourChange={() => {}}
                    onMinuteChange={() => {}}
                    onHourCommit={h => onTime(h, minute)}
                    onMinuteCommit={m => onTime(hour, m)}
                  />
                </View>
              )}

              {panel === 'priority' && (
                <View style={st.prios}>
                  {PRIORITIES.map(p => {
                    const on = p.id === priority;
                    return (
                      <Pressable key={p.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPriority(p.id); }}
                        style={[st.prio, on && { backgroundColor: p.color, borderColor: p.color }]}>
                        <MaterialCommunityIcons name={on ? 'flag' : 'flag-outline'} size={18} color={on ? (p.id === 'LOW' ? C.onHot : p.id === 'HIGH' ? C.hot : C.onHot) : p.color} />
                        <Text style={[st.prioText, on && { color: p.id === 'HIGH' ? C.hot : C.onHot }]}>{p.label}</Text>
                        <Text style={[st.prioNote, on && { color: p.id === 'HIGH' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)' }]}>{p.note}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {panel === 'place' && (
                <View style={{ gap: 10 }}>
                  <View style={st.placeRow}>
                    <MaterialCommunityIcons name="map-marker" size={16} color={C.dim} />
                    <TextInput
                      style={st.placeInput}
                      value={location}
                      onChangeText={onLocation}
                      placeholder="WHERE? E.G. GYM, OFFICE"
                      placeholderTextColor={C.faint}
                      autoCapitalize="characters"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                      selectionColor={C.hot}
                    />
                    {!!location && (
                      <Pressable onPress={() => onLocation('')} hitSlop={8}><MaterialCommunityIcons name="close-circle" size={16} color={C.faint} /></Pressable>
                    )}
                  </View>
                  {recentLocations.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} keyboardShouldPersistTaps="handled">
                      {recentLocations.map(l => (
                        <Pressable key={l} onPress={() => { Haptics.selectionAsync(); onLocation(l); }} style={[st.preset, location === l && st.presetOn]}>
                          <MaterialCommunityIcons name="history" size={13} color={location === l ? C.onHot : C.dim} />
                          <Text style={[st.presetText, location === l && { color: C.onHot }]}>{l}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          )}

          <Pressable
            onPress={submit}
            onPressIn={() => Animated.spring(press, { toValue: 0.96, ...SPRING.settle }).start()}
            onPressOut={() => Animated.spring(press, { toValue: 1, ...SPRING.pop }).start()}
          >
            <Animated.View style={[st.submit, !text.trim() && { opacity: 0.45 }, { transform: [{ scale: press }] }]}>
              <MaterialCommunityIcons name={editing ? 'check' : 'plus'} size={18} color={C.onHot} />
              <Text style={st.submitText}>{editing ? 'SAVE TASK' : 'ADD TASK'}</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({ icon, label, on, tint, dim, onPress }: { icon: Icon; label: string; on: boolean; tint?: string; dim?: boolean; onPress: () => void }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(s, { toValue: 0.93, ...SPRING.settle }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, ...SPRING.pop }).start()}
    >
      <Animated.View style={[st.chip, on && st.chipOn, { transform: [{ scale: s }] }]}>
        <MaterialCommunityIcons name={icon} size={14} color={on ? C.onHot : tint ?? (dim ? C.dim : C.ink)} />
        <Text style={[st.chipText, on && { color: C.onHot }, dim && !on && { color: C.dim }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  scrim: { backgroundColor: C.scrim },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: C.lineHi, paddingHorizontal: 18, gap: 14 },
  grab: { paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.lineHi, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2.5 },
  x: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.dot, fontSize: 26, color: C.hot, letterSpacing: 1, paddingVertical: 6 },
  chips: { gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 13, borderRadius: 19, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.bg, maxWidth: 200 },
  chipOn: { backgroundColor: C.hot, borderColor: C.hot },
  chipText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.2 },
  panel: { backgroundColor: C.bg, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 12 },
  days: { gap: 6 },
  day: { width: 50, height: 60, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: C.surface },
  dayOn: { backgroundColor: C.hot, borderColor: C.hot },
  dayTop: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
  dayNum: { fontFamily: F.dot, fontSize: 18, color: C.ink },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  presetOn: { backgroundColor: C.hot, borderColor: C.hot },
  presetText: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1 },
  prios: { flexDirection: 'row', gap: 8 },
  prio: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingVertical: 12, alignItems: 'center', gap: 4 },
  prioText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.2 },
  prioNote: { fontFamily: F.mono, fontSize: 10, color: C.dim },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: C.lineHi, paddingBottom: 8 },
  placeInput: { flex: 1, fontFamily: F.mono, fontSize: 14, color: C.ink, paddingVertical: 4 },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 16, backgroundColor: C.hot },
  submitText: { fontFamily: F.dot, fontSize: 13, color: C.onHot, letterSpacing: 2 },
});
