// ─────────────────────────────────────────────────────────────────────────
// BODY — the axonometric body map + the health systems (absorbs the old
// HEALTH hub's cards; app/(tabs)/health.tsx stays registered but has no tab).
//
// Tap a muscle → a floating panel assigns it a target category, a note and
// whether its callout stays pinned. Categories are the user's own (rename,
// recolour, add, delete). Everything persists locally via lib/body-map.ts.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Animated, TextInput, Modal,
  useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING } from '@/lib/theme';
import {
  REGIONS, REGION_BY_ID, loadBodyMap, saveBodyMap,
  type BodyMap, type Category, type Tone,
} from '@/lib/body-map';
import { BodyStage, TONE } from '@/components/body/BodyStage';
import { Board, BoardRow } from '@/components/Board';

const VIEWS = [
  { label: 'FRONT', yaw: 0 },
  { label: 'AXON', yaw: -0.62 },
  { label: 'SIDE', yaw: -Math.PI / 2 },
  { label: 'BACK', yaw: Math.PI },
];

const SYSTEMS: { label: string; route: string }[] = [
  { label: 'CALORIES', route: '/calorie' },
  { label: 'SLEEP', route: '/modals/sleep-detail' },
  { label: 'MOOD', route: '/modals/mood' },
  { label: 'STEPS', route: '/steps' },
  { label: 'WATER + WEIGHT', route: '/(tabs)/gym' },
  { label: 'CYCLE', route: '/modals/cycle-tracking' },
];

export default function BodyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [map, setMap] = useState<BodyMap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [view, setView] = useState(1);
  const [yawTarget, setYawTarget] = useState({ yaw: VIEWS[1].yaw, key: 0 });
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadBodyMap().then(setMap); }, []);

  const update = useCallback((fn: (m: BodyMap) => BodyMap) => {
    setMap(prev => {
      if (!prev) return prev;
      const next = fn(prev);
      saveBodyMap(next);
      return next;
    });
  }, []);

  const select = (id: string | null) => {
    if (id) Haptics.selectionAsync();
    setSelected(id);
  };

  const assign = (regionId: string, categoryId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update(m => {
      const cur = m.marks[regionId];
      const marks = { ...m.marks };
      if (cur?.category === categoryId) delete marks[regionId];
      else marks[regionId] = { ...cur, pinned: cur?.pinned ?? true, category: categoryId };
      return { ...m, marks };
    });
  };

  if (!map) return <SafeAreaView style={styles.safe} />;

  const stageH = Math.min(500, Math.round(width * 1.18));
  const counts = Object.values(map.marks).reduce<Record<string, number>>((a, m) => ({ ...a, [m.category]: (a[m.category] ?? 0) + 1 }), {});
  const targets = REGIONS.filter(r => map.marks[r.id]).sort((a, b) =>
    map.categories.findIndex(c => c.id === map.marks[a.id].category) - map.categories.findIndex(c => c.id === map.marks[b.id].category));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: selected ? 300 : 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{`${targets.length} TARGETS · ${REGIONS.length} REGIONS`}</Text>
            <Text style={styles.title}>BODY</Text>
          </View>
          <Pressable onPress={() => setEditing(true)} style={styles.ghostBtn} hitSlop={8}>
            <Text style={styles.ghostBtnText}>CATEGORIES</Text>
          </Pressable>
        </View>

        <View style={styles.views}>
          {VIEWS.map((v, i) => (
            <Pressable
              key={v.label}
              onPress={() => { Haptics.selectionAsync(); setView(i); setYawTarget({ yaw: v.yaw, key: Date.now() }); }}
              style={[styles.view, view === i && styles.viewOn]}
            >
              <Text style={[styles.viewText, view === i && styles.viewTextOn]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>

        <BodyStage
          width={width}
          height={stageH}
          map={map}
          selected={selected}
          filter={filter}
          yawTarget={yawTarget}
          onSelect={select}
          onMoveLabel={(id, dx, dy) => update(m => m.marks[id] ? { ...m, marks: { ...m.marks, [id]: { ...m.marks[id], dx, dy } } } : m)}
        />

        <Text style={styles.hint}>DRAG TO ROTATE · TAP A MUSCLE TO TARGET IT</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>
          {map.categories.map(c => {
            const on = filter === c.id;
            return (
              <Pressable key={c.id} onPress={() => setFilter(on ? null : c.id)} style={[styles.legendChip, on && { borderColor: TONE[c.tone] }]}>
                <View style={[styles.swatch, { backgroundColor: TONE[c.tone] }]} />
                <Text style={[styles.legendText, on && { color: C.hot }]}>{c.name}</Text>
                <Text style={styles.legendCount}>{counts[c.id] ?? 0}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Board title="TARGETS" empty={targets.length === 0 ? 'NOTHING TARGETED YET' : undefined}>
          {targets.map((r, i) => {
            const mk = map.marks[r.id];
            const cat = map.categories.find(c => c.id === mk.category);
            return (
              <BoardRow key={r.id} index={i + 1} last={i === targets.length - 1} onPress={() => select(r.id)}
                label={r.name}
                sub={mk.note}
                right={<Text style={[styles.rowTag, cat && { color: TONE[cat.tone] }]}>{cat?.name ?? ''}</Text>}
              />
            );
          })}
        </Board>

        <Board title="SYSTEMS">
          {SYSTEMS.map((s, i) => (
            <BoardRow key={s.label} index={i + 1} last={i === SYSTEMS.length - 1} label={s.label} onPress={() => router.push(s.route as any)}
              right={<MaterialCommunityIcons name="arrow-right" size={16} color={C.dim} />} />
          ))}
        </Board>
      </ScrollView>

      <AssignPanel
        map={map}
        regionId={selected}
        onAssign={assign}
        onNote={(id, note) => update(m => m.marks[id] ? { ...m, marks: { ...m.marks, [id]: { ...m.marks[id], note } } } : m)}
        onPin={id => update(m => m.marks[id] ? { ...m, marks: { ...m.marks, [id]: { ...m.marks[id], pinned: !m.marks[id].pinned } } } : m)}
        onClose={() => setSelected(null)}
        onNewCategory={() => setEditing(true)}
      />

      <CategoryEditor
        visible={editing}
        categories={map.categories}
        onClose={() => setEditing(false)}
        onChange={categories => update(m => {
          const ids = new Set(categories.map(c => c.id));
          const marks = Object.fromEntries(Object.entries(m.marks).filter(([, v]) => ids.has(v.category)));
          return { categories, marks };
        })}
      />
    </SafeAreaView>
  );
}

// ── floating assign panel ────────────────────────────────────────────────

function AssignPanel({ map, regionId, onAssign, onNote, onPin, onClose, onNewCategory }: {
  map: BodyMap; regionId: string | null;
  onAssign: (id: string, cat: string) => void; onNote: (id: string, note: string) => void;
  onPin: (id: string) => void; onClose: () => void; onNewCategory: () => void;
}) {
  const y = useRef(new Animated.Value(400)).current;
  const [shown, setShown] = useState<string | null>(regionId);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (regionId) {
      setShown(regionId);
      setNote(map.marks[regionId]?.note ?? '');
      y.setValue(60);
      Animated.spring(y, { toValue: 0, ...SPRING.pop }).start();
    } else {
      Animated.timing(y, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => setShown(null));
    }
  }, [regionId]);

  if (!shown) return null;
  const region = REGION_BY_ID[shown];
  const mark = map.marks[shown];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={styles.panelWrap} pointerEvents="box-none">
      <Animated.View style={[styles.panel, { transform: [{ translateY: y }] }]}>
        <View style={styles.panelHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelEyebrow}>{region.plate === 'front' ? 'FRONT PLATE' : 'BACK PLATE'}</Text>
            <Text style={styles.panelTitle}>{region.name}</Text>
          </View>
          {mark && (
            <Pressable onPress={() => onPin(shown)} hitSlop={8} style={[styles.pinBtn, mark.pinned && styles.pinBtnOn]}>
              <MaterialCommunityIcons name={mark.pinned ? 'pin' : 'pin-off-outline'} size={14} color={mark.pinned ? C.onHot : C.dim} />
              <Text style={[styles.pinText, mark.pinned && { color: C.onHot }]}>CALLOUT</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 10 }}>
            <MaterialCommunityIcons name="close" size={20} color={C.dim} />
          </Pressable>
        </View>

        <Text style={styles.panelLabel}>TARGET</Text>
        <View style={styles.catWrap}>
          {map.categories.map(c => {
            const on = mark?.category === c.id;
            return (
              <Pressable key={c.id} onPress={() => onAssign(shown, c.id)}
                style={[styles.cat, on && { backgroundColor: TONE[c.tone], borderColor: TONE[c.tone] }]}>
                {!on && <View style={[styles.swatch, { backgroundColor: TONE[c.tone] }]} />}
                <Text style={[styles.catText, on && { color: C.onHot }]}>{c.name}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onNewCategory} style={[styles.cat, { borderStyle: 'dashed' }]}>
            <Text style={styles.catText}>+ NEW</Text>
          </Pressable>
        </View>

        {mark && (
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            onEndEditing={() => onNote(shown, note.trim())}
            placeholder="Note — e.g. lagging side, 3x/wk, tweaked Tue"
            placeholderTextColor={C.faint}
            returnKeyType="done"
          />
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

// ── category editor ──────────────────────────────────────────────────────

const TONES: Tone[] = ['hot', 'signal', 'live', 'dim', 'alert'];

function CategoryEditor({ visible, categories, onChange, onClose }: {
  visible: boolean; categories: Category[]; onChange: (c: Category[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(categories);
  useEffect(() => { if (visible) setDraft(categories); }, [visible]);
  const save = () => {
    onChange(draft.map(c => ({ ...c, name: c.name.trim().toUpperCase() || 'UNTITLED' })));
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={save}>
      <View style={styles.editor}>
        <View style={styles.editorHead}>
          <Text style={styles.editorTitle}>CATEGORIES</Text>
          <Pressable onPress={save} style={styles.doneBtn}><Text style={styles.doneText}>DONE</Text></Pressable>
        </View>
        <Text style={styles.editorSub}>Name what you're aiming at. Deleting one clears the regions tagged with it.</Text>
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {draft.map((c, i) => (
            <View key={c.id} style={styles.editRow}>
              <TextInput
                style={styles.editName}
                value={c.name}
                autoCapitalize="characters"
                maxLength={14}
                onChangeText={name => setDraft(d => d.map((x, j) => (j === i ? { ...x, name } : x)))}
              />
              <View style={styles.tones}>
                {TONES.map(t => (
                  <Pressable key={t} onPress={() => setDraft(d => d.map((x, j) => (j === i ? { ...x, tone: t } : x)))}
                    style={[styles.tone, { backgroundColor: TONE[t] }, c.tone === t && styles.toneOn]} />
                ))}
              </View>
              <Pressable onPress={() => setDraft(d => d.filter((_, j) => j !== i))} hitSlop={8}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.dim} />
              </Pressable>
            </View>
          ))}
          <Pressable
            style={styles.addCat}
            onPress={() => setDraft(d => [...d, { id: `c${Date.now().toString(36)}`, name: 'NEW', tone: TONES[d.length % TONES.length] }])}
          >
            <Text style={styles.addCatText}>+ ADD CATEGORY</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 4 },
  ghostBtn: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 6 },
  ghostBtnText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 2 },

  views: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: 999, padding: 3 },
  view: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  viewOn: { backgroundColor: C.hot },
  viewText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2 },
  viewTextOn: { color: C.onHot },

  hint: { fontFamily: F.mono, fontSize: 10, color: C.faint, letterSpacing: 1, textAlign: 'center', marginTop: 2 },
  legend: { gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  legendText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1.5 },
  legendCount: { fontFamily: F.dot, fontSize: 11, color: C.faint },
  swatch: { width: 7, height: 7 },

  rowTag: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 1.5 },

  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    margin: 10, padding: 16, borderRadius: 22, backgroundColor: C.raised,
    borderWidth: 1, borderColor: C.lineHi,
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
  },
  panelHead: { flexDirection: 'row', alignItems: 'center' },
  panelEyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  panelTitle: { fontFamily: F.dot, fontSize: 22, color: C.ink, letterSpacing: 1, marginTop: 3 },
  pinBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pinBtnOn: { backgroundColor: C.hot, borderColor: C.hot },
  pinText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.5 },
  panelLabel: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.lineHi, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  catText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  note: { marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.mono, fontSize: 13, color: C.ink, backgroundColor: C.bg },

  editor: { flex: 1, backgroundColor: C.bg, padding: 20 },
  editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  editorTitle: { fontFamily: F.dot, fontSize: 26, color: C.ink, letterSpacing: 2 },
  editorSub: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginTop: 8, marginBottom: 18, lineHeight: 18 },
  doneBtn: { backgroundColor: C.hot, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  doneText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, backgroundColor: C.surface },
  editName: { flex: 1, fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 1, paddingVertical: 4 },
  tones: { flexDirection: 'row', gap: 7 },
  tone: { width: 18, height: 18, borderRadius: 4, opacity: 0.45 },
  toneOn: { opacity: 1, borderWidth: 2, borderColor: C.ink },
  addCat: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineHi, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addCatText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 2 },
});
