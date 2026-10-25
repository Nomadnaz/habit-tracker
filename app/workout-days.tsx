// ─────────────────────────────────────────────────────────────────────────
// WORKOUT DAYS — every day you've saved, from SELECT's DAYS. Tap a card to
// open it: RENAME in place, EDIT LIFTS (LOG WORKOUT on that day, where its
// lifts are added, swapped and removed), DELETE. + makes a new day, named
// here, then opens it so you can fill it. The coach's next one is green.
// A focus day keeps its focus only while its name says it ("PUSH DAY");
// renamed to "CHEST & TRIS" it becomes one of your own days.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import {
  archiveTemplate, createTemplate, getExercises, getJunctions, getTemplates, renameTemplate,
  type Exercise, type Focus, type WorkoutTemplate,
} from '@/lib/workout-data';
import { FOCI, focusOfName } from '@/lib/coach';
import { loadCoach } from '@/lib/routine';
import { HeaderIcon, ScreenHeader } from '@/components/ScreenHeader';
import { C, F } from '@/lib/theme';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
import { reducedMotion } from '@/lib/use-reduced-motion';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
const pad2 = (n: number) => String(n).padStart(2, '0');

type Day = { t: WorkoutTemplate; focus: Focus | null; lifts: Exercise[] };

export default function WorkoutDays() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<Day[]>([]);
  const gone = usePendingRemovals();
  const [next, setNext] = useState<Focus | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const busy = useRef(false);

  const load = useCallback(async () => {
    const [templates, junctions, exercises] = await Promise.all([getTemplates(), getJunctions(), getExercises()]);
    const byId = Object.fromEntries(exercises.map(e => [e.id, e]));
    const rank = (d: Day) => (d.focus ? FOCI.indexOf(d.focus) : FOCI.length);
    const list = templates.filter(t => !t.isArchived).map(t => ({
      t, focus: focusOfName(t.name),
      lifts: junctions.filter(j => j.templateId === t.id).sort((a, b) => a.orderIndex - b.orderIndex).map(j => byId[j.exerciseId]).filter(Boolean),
    })).sort((a, b) => rank(a) - rank(b) || a.t.name.localeCompare(b.t.name));
    setDays(list);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    void loadCoach().then(c => setNext(c.today.focus)).catch(() => {});
  }, [load]));

  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    animate();
    setRenaming(null);
    setOpen(o => (o === id ? null : id));
  };

  const startRename = (d: Day) => { setDraft(d.t.name); setRenaming(d.t.id); };

  const commitRename = async (id: string) => {
    const name = draft.trim();
    setRenaming(null);
    if (!name) return;
    await renameTemplate(id, name);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await load();
  };

  const create = async () => {
    const name = draft.trim();
    if (!name || busy.current) { setCreating(false); return; }
    busy.current = true;
    const t = await createTemplate(name, '#FFFFFF');
    busy.current = false;
    setCreating(false);
    setDraft('');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({ pathname: '/workouts', params: { templateId: t.id } });
  };

  // Gone at once; the toast's UNDO brings it back. Its lifts and their history stay either way.
  const remove = (d: Day) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion()) animate();
    setOpen(null);
    removeWithUndo({ key: d.t.id, label: `${d.t.name.toUpperCase()} DELETED`, commit: () => archiveTemplate(d.t.id), after: load });
  };
  const shown = days.filter(d => !gone.has(d.t.id));

  const openLifts = (d: Day) => router.push({ pathname: '/workouts', params: { templateId: d.t.id } });

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScreenHeader
        title="WORKOUT DAYS"
        right={<HeaderIcon icon="plus" label="New day" onPress={() => { animate(); setDraft(''); setRenaming(null); setCreating(true); }} />}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap: 10 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={st.eyebrow}>{shown.length} DAYS  ·  TAP ONE TO EDIT</Text>

        {creating && (
          <View style={[st.card, st.cardOn]}>
            <Text style={st.index}>NEW</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              autoCapitalize="characters"
              placeholder="NAME YOUR DAY — E.G. ARMS"
              placeholderTextColor={C.faint}
              style={st.input}
              returnKeyType="done"
              onSubmitEditing={create}
              onBlur={() => { if (!draft.trim()) setCreating(false); }}
            />
            <View style={st.actions}>
              <Action label="CREATE" hot onPress={create} />
              <Action label="CANCEL" onPress={() => { animate(); setCreating(false); }} />
            </View>
          </View>
        )}

        {shown.map((d, i) => {
          const isOpen = open === d.t.id;
          const isNext = d.focus != null && d.focus === next;
          return (
            <Pressable key={d.t.id} onPress={() => toggle(d.t.id)} style={[st.card, isOpen && st.cardOn, isNext && st.cardNext]}>
              <View style={st.head}>
                <Text style={[st.index, isNext && { color: C.live }]}>{pad2(i + 1)}</Text>
                {isNext && <Text style={st.nextTag}>NEXT</Text>}
                {d.focus == null && <Text style={st.tag}>YOURS</Text>}
                <View style={{ flex: 1 }} />
                <Text style={st.count}>{d.lifts.length} LIFTS</Text>
              </View>

              {renaming === d.t.id ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  autoCapitalize="characters"
                  style={st.input}
                  returnKeyType="done"
                  selectTextOnFocus
                  onSubmitEditing={() => commitRename(d.t.id)}
                  onBlur={() => commitRename(d.t.id)}
                />
              ) : (
                <Text style={[st.name, isNext && { color: C.live }]} numberOfLines={1}>{d.t.name}</Text>
              )}

              <Text style={st.lifts} numberOfLines={isOpen ? undefined : 1}>
                {d.lifts.length ? d.lifts.map(e => e.name).join('  ·  ') : 'NO LIFTS YET'}
              </Text>

              {isOpen && renaming !== d.t.id && (
                <View style={st.actions}>
                  <Action label="EDIT LIFTS" hot onPress={() => openLifts(d)} />
                  <Action label="RENAME" onPress={() => startRename(d)} />
                  <Action label="DELETE" danger onPress={() => remove(d)} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ label, onPress, hot, danger }: { label: string; onPress: () => void; hot?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [st.action, hot && st.actionHot, danger && { borderColor: C.alert }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[st.actionText, hot && { color: C.onHot }, danger && { color: C.alert }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.dim, marginBottom: 4 },
  card: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 14, gap: 6 },
  cardOn: { borderColor: C.lineHi, backgroundColor: C.raised },
  cardNext: { borderColor: 'rgba(116,242,91,0.45)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  index: { fontFamily: F.dot, fontSize: 10, letterSpacing: 1, color: C.faint },
  nextTag: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.onHot, backgroundColor: C.live, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  tag: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.dim, borderWidth: 1, borderColor: C.lineHi, paddingHorizontal: 4 },
  count: { fontFamily: F.dot, fontSize: 10, letterSpacing: 1, color: C.dim },
  name: { fontFamily: F.dot, fontSize: 24, letterSpacing: 1, color: C.ink },
  input: { fontFamily: F.dot, fontSize: 22, letterSpacing: 1, color: C.ink, paddingVertical: 4, borderBottomWidth: 1, borderColor: C.live },
  lifts: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: C.dim, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  action: { height: 34, paddingHorizontal: 14, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  actionHot: { backgroundColor: C.live, borderColor: C.live },
  actionText: { fontFamily: F.dot, fontSize: 11, letterSpacing: 1.5, color: C.ink },
});
