// BODY's panels, kept out of the screen (app/(tabs)/index.tsx): the
// floating panel for a framed zone or a picked muscle (recovery, GOAL, GO),
// the GO sheet of lifts that work it, the goal-category editor, and the
// caption above the figure for the gauge's mode (RECOVERY or READY).

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Animated, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, SPRING, numFace } from '@/lib/theme';
import { REGION_BY_ID, type BodyMap, type Category, type Tone } from '@/lib/body-map';
import { Battery, TONE, batteryTone } from '@/components/body/BodyStage';
import { ZONE_BY_ID, type Zone } from '@/lib/body-mesh';
import type { Exercise } from '@/lib/workout-data';
import {
  baseOf, byExercise, suggestionsFor, runSteps, type MuscleStatus, type Session, type Run,
} from '@/lib/muscle-recovery';
import { TypeLine } from '@/components/TypeLine';
import type { Guide } from '@/lib/exercise-guide';
import { ExerciseCard } from '@/components/ExerciseCard';
import { toDateKey } from '@/lib/dateKey';

// ── floating assign panel ────────────────────────────────────────────────

// A framed zone shows a strip of its muscles; a picked muscle shows the
// full panel.
export function AssignPanel({ map, zone, regionId, status, battery, batteryOf, onPick, onAssign, onNote, onClose, onNewCategory, onGo }: {
  map: BodyMap; zone: string | null; regionId: string | null; status: MuscleStatus | null; battery: number | null;
  batteryOf: (id: string) => number | null; onPick: (id: string) => void;
  onAssign: (id: string, cat: string) => void; onNote: (id: string, note: string) => void;
  onClose: () => void; onNewCategory: () => void; onGo: () => void;
}) {
  const y = useRef(new Animated.Value(400)).current;
  const showing = regionId ?? (zone ? `zone:${zone}` : null);
  const [shown, setShown] = useState<string | null>(showing);
  const [note, setNote] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);

  useEffect(() => {
    setGoalOpen(false);
    if (showing) {
      setShown(showing);
      if (regionId) setNote(map.marks[regionId]?.note ?? '');
      y.setValue(60);
      Animated.spring(y, { toValue: 0, ...SPRING.pop }).start();
    } else {
      // Only once it's really off: a tap that reopens it mid-slide must not lose it.
      Animated.timing(y, { toValue: 400, duration: 200, useNativeDriver: true }).start(({ finished }) => { if (finished) setShown(null); });
    }
  }, [showing]);

  if (!shown) return null;

  // One wrapper for both, so the slide-in isn't cut short by a remount
  // when a zone's strip turns into a muscle's panel.
  const framed = shown.startsWith('zone:') ? ZONE_BY_ID[shown.slice(5)] : null;
  const region = REGION_BY_ID[shown];
  const mark = map.marks[shown];
  const cat = mark ? map.categories.find(c => c.id === mark.category) : undefined;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={styles.panelWrap} pointerEvents="box-none">
      <Animated.View style={[styles.panel, { transform: [{ translateY: y }] }]}>
        {framed ? <ZoneStrip zone={framed} batteryOf={batteryOf} onPick={onPick} onClose={onClose} /> : (
          <>
          <View style={styles.panelHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelEyebrow}>{region.side ? `${region.group}  ${region.side === 'l' ? 'LEFT' : 'RIGHT'}` : region.group}</Text>
              <Text style={styles.panelTitle}>{region.name}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 10 }}>
              <MaterialCommunityIcons name="close" size={20} color={C.dim} />
            </Pressable>
          </View>

          {status && battery != null && <Recovery status={status} battery={battery} />}

          <View style={styles.actions}>
            <Pressable onPress={() => setGoalOpen(o => !o)} style={[styles.action, goalOpen && { borderColor: C.live }]}>
              <View style={styles.actionTop}>
                <Text style={styles.actionLabel}>GOAL</Text>
                <MaterialCommunityIcons name={goalOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.live} />
              </View>
              <View style={styles.actionValue}>
                {cat && <View style={[styles.swatch, { backgroundColor: TONE[cat.tone] }]} />}
                <Text style={[styles.actionValueText, cat && { color: TONE[cat.tone] }]} numberOfLines={1}>{cat?.name ?? 'NONE SET'}</Text>
              </View>
            </Pressable>
            <Pressable onPress={onGo} style={({ pressed }) => [styles.action, pressed && { borderColor: C.live }]}>
              <View style={styles.actionTop}>
                <Text style={styles.actionLabel}>GO</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={C.live} />
              </View>
              <Text style={styles.actionValueText}>WORKOUTS</Text>
            </Pressable>
          </View>

          {goalOpen && (
            <View style={styles.dropdown}>
              {map.categories.map((c, i) => {
                const on = mark?.category === c.id;
                return (
                  <Pressable key={c.id} onPress={() => { onAssign(shown, c.id); setGoalOpen(false); }}
                    style={({ pressed }) => [styles.option, i > 0 && styles.optionRule, pressed && { backgroundColor: C.surface }]}>
                    <View style={[styles.swatch, { backgroundColor: TONE[c.tone] }]} />
                    <Text style={[styles.optionText, on && { color: TONE[c.tone] }]}>{c.name}</Text>
                    {on && <MaterialCommunityIcons name="check" size={16} color={TONE[c.tone]} />}
                  </Pressable>
                );
              })}
              <Pressable onPress={onNewCategory} style={({ pressed }) => [styles.option, styles.optionRule, pressed && { backgroundColor: C.surface }]}>
                <Text style={[styles.optionText, { color: C.dim }]}>+ NEW GOAL</Text>
              </Pressable>
            </View>
          )}

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
          </>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function ZoneStrip({ zone, batteryOf, onPick, onClose }: {
  zone: Zone; batteryOf: (id: string) => number | null; onPick: (id: string) => void; onClose: () => void;
}) {
  const oneSide = /\.[lr]$/.test(zone.id); // 'L THIGH' — drop the L from each muscle
  return (
    <>
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelEyebrow}>{`${zone.muscles.length} MUSCLES · TAP ONE`}</Text>
          <Text style={styles.panelTitle}>{zone.name}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 10 }}>
          <MaterialCommunityIcons name="close" size={20} color={C.dim} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneStrip}>
        {zone.muscles.map(id => {
          const pct = batteryOf(id);
          const name = REGION_BY_ID[id].name;
          return (
            <Pressable key={id} onPress={() => onPick(id)} style={({ pressed }) => [styles.zoneChip, pressed && { backgroundColor: C.surface }]}>
              <Text style={styles.zoneChipName} numberOfLines={1}>{oneSide ? name.slice(2) : name}</Text>
              {pct != null && <Text style={[numFace(`${pct}%`, 13), { color: batteryTone(pct) }]}>{`${pct}%`}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

// ── recovery: battery, last worked, recent exercises ─────────────────────

const DAY = 86_400_000;
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function daysAgo(at: number) {
  const a = new Date(at), b = new Date();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(b) - midnight(a)) / DAY);
}
function agoText(at: number) {
  const d = daysAgo(at);
  return d <= 0 ? 'TODAY' : d === 1 ? 'YESTERDAY' : `${d} DAYS AGO`;
}
function readyText(readyAt: number | null) {
  if (readyAt == null || readyAt <= Date.now()) return 'NOW';
  const h = Math.ceil((readyAt - Date.now()) / 3_600_000);
  return h < 36 ? `IN ${h}H` : `IN ${Math.round(h / 24)} DAYS`;
}
function dayTag(s: Session) {
  if (s.date === toDateKey(new Date())) return 'TODAY';
  const [y, m, d] = s.date.split('-').map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${d}`;
}

function Recovery({ status, battery }: { status: MuscleStatus; battery: number }) {
  const recent = byExercise(status.hits).slice(0, 4);
  return (
    <View style={styles.rec}>
      <View style={styles.recTop}>
        <View>
          <Text style={styles.panelLabelTight}>RECOVERY</Text>
          <Battery pct={battery} cells={12} cellW={8} cellH={14} />
        </View>
        <View style={styles.recFacts}>
          <View style={styles.recFact}>
            <Text style={styles.recFactLabel}>LAST WORKED</Text>
            <Text style={styles.recFactValue}>{status.lastAt ? agoText(status.lastAt) : 'NOT RECENTLY'}</Text>
          </View>
          <View style={styles.recFact}>
            <Text style={styles.recFactLabel}>READY</Text>
            <Text style={[styles.recFactValue, { color: batteryTone(battery) }]}>{readyText(status.readyAt)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.panelLabel}>RECENT EXERCISES</Text>
      {recent.length === 0 ? (
        <Text style={styles.recEmpty}>Nothing in the last 3 weeks has worked this.</Text>
      ) : recent.map(({ session: s, share, times }) => (
        <View key={s.exerciseId} style={styles.recRow}>
          <View style={[styles.recShare, { opacity: 0.35 + share * 0.65 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.recName} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.recDetail} numberOfLines={1}>
              {s.measured
                ? `${s.sets} ${s.sets === 1 ? 'set' : 'sets'} · best ${s.weightKg}kg × ${s.reps ?? '?'}`
                : `${s.sets} × ${s.reps ?? '?'} @ ${s.weightKg}kg · planned`}
              {times > 1 ? ` · ${times}× in 3 wks` : ''}
              {share < 0.95 ? ' · assist' : ''}
            </Text>
          </View>
          <Text style={styles.recDay}>{dayTag(s)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── GO: exercises that work the muscle ───────────────────────────────────

/** Your best estimated 1RM for an exercise, from logged sessions or its working weight in the library. */
export function bestE1rm(name: string, sessions: Session[], library: Exercise[]): number | null {
  const key = name.trim().toUpperCase();
  const e1 = (kg: number, reps: number | null) => (kg > 0 ? kg * (1 + (reps ?? 1) / 30) : 0);
  const fromLog = sessions.filter(s => s.name.trim().toUpperCase() === key).map(s => e1(s.weightKg, s.reps));
  const lib = library.find(e => e.name.trim().toUpperCase() === key);
  const fromLib = lib ? e1(lib.weightKg, parseInt(lib.reps, 10) || null) : 0;
  const best = Math.max(0, fromLib, ...fromLog);
  return best > 0 ? best : null;
}

export function GoSheet({ visible, regionId, status, library, guide, bodyKg, onClose }: {
  visible: boolean; regionId: string | null; status: MuscleStatus | null; library: Exercise[];
  guide: (name: string) => Guide; bodyKg: number | null; onClose: () => void;
}) {
  const [open, setOpen] = useState<{ name: string; role: string } | null>(null);
  useEffect(() => { if (!visible) setOpen(null); }, [visible]);
  const region = regionId ? REGION_BY_ID[regionId] : null;
  const base = regionId ? baseOf(regionId) : '';
  const recent = status ? byExercise(status.hits) : [];
  const more = region ? suggestionsFor(base, status?.hits ?? [], library) : [];
  const role = (share: number) => (share >= 0.95 ? 'Primary' : share >= 0.6 ? 'Strong assist' : 'Assist');
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.editor}>
        <View style={styles.editorHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelEyebrow}>GO</Text>
            <Text style={styles.editorTitle} numberOfLines={1} adjustsFontSizeToFit>{region ? (region.side ? region.name.slice(2) : region.name) : ''}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.doneBtn}><Text style={styles.doneText}>DONE</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.panelLabel}>{`DONE RECENTLY · ${recent.length}`}</Text>
          {recent.length === 0 ? (
            <Text style={styles.recEmpty}>Nothing in the last 3 weeks has worked this.</Text>
          ) : recent.map(({ session: s, share, times }) => (
            <Pressable key={s.exerciseId} onPress={() => { Haptics.selectionAsync(); setOpen({ name: s.name, role: role(share).toUpperCase() }); }}
              style={({ pressed }) => [styles.goRow, pressed && { backgroundColor: C.surface }]}>
              <View style={[styles.recShare, { opacity: 0.35 + share * 0.65 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.recDetail} numberOfLines={1}>{`${role(share)} · ${times}× in 3 wks · ${s.weightKg}kg best`}</Text>
              </View>
              <Text style={styles.recDay}>{dayTag(s)}</Text>
              <MaterialCommunityIcons name="play-circle-outline" size={18} color={C.dim} />
            </Pressable>
          ))}

          <Text style={[styles.panelLabel, { marginTop: 22 }]}>{`RECOMMENDED · ${more.length}`}</Text>
          {more.length === 0 ? (
            <Text style={styles.recEmpty}>No lifts aimed at this one — it works as part of bigger movements.</Text>
          ) : more.map(x => (
            <Pressable key={x.name} onPress={() => { Haptics.selectionAsync(); setOpen({ name: x.name, role: role(x.share).toUpperCase() }); }}
              style={({ pressed }) => [styles.goRow, pressed && { backgroundColor: C.surface }]}>
              <View style={[styles.recShare, { opacity: 0.35 + x.share * 0.65 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recName} numberOfLines={1}>{x.name.toUpperCase()}</Text>
                <Text style={styles.recDetail} numberOfLines={1}>{x.mine ? `${role(x.share)} · in your library` : role(x.share)}</Text>
              </View>
              <MaterialCommunityIcons name="play-circle-outline" size={18} color={C.dim} />
            </Pressable>
          ))}
        </ScrollView>
        {open && <ExerciseCard name={open.name} role={open.role} guide={guide(open.name)} bodyKg={bodyKg} onClose={() => setOpen(null)} />}
      </View>
    </Modal>
  );
}

// ── category editor ──────────────────────────────────────────────────────

const TONES: Tone[] = ['hot', 'signal', 'live', 'dim', 'alert'];

export function CategoryEditor({ visible, categories, onChange, onClose }: {
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

  lensSlot: { height: 66, justifyContent: 'flex-end', marginTop: 2, marginBottom: 6 },
  lens: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20 },
  lensChips: { flexDirection: 'row', gap: 6 },
  lensChip: { flexDirection: 'row', alignItems: 'baseline', gap: 5, borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  lensChipVal: { fontFamily: F.dot, fontSize: 14, color: C.hot, letterSpacing: 0.5 },
  lensChipLabel: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1.2 },
  lensTitle: { fontFamily: F.dot, fontSize: 26, color: C.hot, letterSpacing: 1 },
  lensSub: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 2 },
  scale: { alignItems: 'flex-end', gap: 4, marginBottom: 2 },
  scaleBar: { flexDirection: 'row', gap: 2 },
  scaleCell: { width: 9, height: 9 },
  scaleText: { fontFamily: F.mono, fontSize: 9, color: C.faint },
  swatch: { width: 7, height: 7 },



  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    margin: 10, padding: 16, borderRadius: 22, backgroundColor: C.raised,
    borderWidth: 1, borderColor: C.lineHi,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center' },
  panelEyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  panelTitle: { fontFamily: F.dot, fontSize: 22, color: C.ink, letterSpacing: 1, marginTop: 3 },
  panelLabel: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  panelLabelTight: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2, marginBottom: 2 },
  rec: { marginTop: 12 },
  recTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  recFacts: { flexDirection: 'row', gap: 14 },
  recFact: { alignItems: 'flex-end' },
  recFactLabel: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1.5 },
  recFactValue: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1, marginTop: 4 },
  recEmpty: { fontFamily: F.mono, fontSize: 12, color: C.dim },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  recShare: { width: 3, alignSelf: 'stretch', backgroundColor: C.hot, borderRadius: 2 },
  recName: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1 },
  recDetail: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 2 },
  recDay: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  zoneStrip: { gap: 8, paddingTop: 12 },
  zoneChip: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 4, minWidth: 92 },
  zoneChipName: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  actionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionLabel: { fontFamily: F.dot, fontSize: 15, color: C.live, letterSpacing: 2 },
  actionValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionValueText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5, flexShrink: 1 },
  dropdown: { marginTop: 8, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 42 },
  optionRule: { borderTopWidth: 1, borderTopColor: C.line },
  optionText: { flex: 1, fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1.5 },
  goRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
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

// ── lens caption ─────────────────────────────────────────────────────────

export type LensInfo = {
  title: string; sub: string; tone: string; from: number; scale: string;
  /** Boxed figures under the title (RECOVERY: steps, runs, lifts). */
  chips?: { value: string; label: string; note?: string }[];
};

/** The caption above the figure: a fixed-height slot (so the page never jumps)
 *  that springs in and types its title, line and figures out one after another. */
export function LensCaption({ info }: { info: LensInfo | null }) {
  const enter = useRef(new Animated.Value(0)).current;
  const key = info ? `${info.title}|${info.sub}|${info.chips?.map(c => c.value).join(',') ?? ''}` : '';
  useEffect(() => {
    enter.setValue(0);
    if (info) Animated.spring(enter, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, [key]);
  if (!info) return <View style={styles.lensSlot} />;
  const titleMs = info.title.length * 26;
  return (
    <View style={styles.lensSlot}>
      <Animated.View style={[styles.lens, {
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <TypeLine key={`t${key}`} text={info.title} style={styles.lensTitle} speed={26} cursor={info.tone} />
          {info.chips ? (
            <View style={styles.lensChips}>
              {info.chips.map((c, i) => (
                <View key={c.label} style={styles.lensChip}>
                  <TypeLine key={`c${key}${i}`} text={c.value} style={styles.lensChipVal} delay={titleMs + i * 160} speed={45} />
                  <Text style={styles.lensChipLabel}>{c.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <TypeLine key={`s${key}`} text={info.sub} style={styles.lensSub} delay={titleMs} speed={12} />
          )}
        </View>
        <View style={styles.scale}>
          <View style={styles.scaleBar}>
            {[0, 0.25, 0.5, 0.75, 1].map(t => (
              <View key={t} style={[styles.scaleCell, { backgroundColor: info.tone, opacity: info.from + (1 - info.from) * t }]} />
            ))}
          </View>
          <Text style={styles.scaleText}>{info.scale}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/** The caption above the figure for RECOVERY: last week's load. */
export function recoveryCaption(worn: Session[], runs: Run[], steps: Record<string, number>, now: number): LensInfo {
  const week = now - 7 * 86_400_000;
  const n = runs.filter(r => r.end >= week).length;
  const total = Object.entries(steps).filter(([k]) => Date.parse(k) >= week - 86_400_000).reduce((a, [, v]) => a + v, 0);
  const ran = runs.filter(r => r.end >= week).reduce((a, r) => a + runSteps(r), 0);
  const lifts = worn.filter(x => x.name !== 'RUN' && x.name !== 'WALKING' && x.at >= week).length;
  return {
    title: 'RECOVERY',
    sub: 'Last 7 days, weighted by how hard each hit',
    tone: C.alert, from: 0, scale: 'FRESH → WORN',
    chips: [
      { value: `${Math.round(total / 1000)}K`, label: 'STEPS' },
      { value: `${n}`, label: n === 1 ? 'RUN' : 'RUNS', note: n ? `${Math.round(ran / 1000)}K STRIDES` : undefined },
      { value: `${lifts}`, label: lifts === 1 ? 'LIFT' : 'LIFTS' },
    ],
  };
}

/** The caption above the figure for READY: how many muscles are good to go. */
export function readyCaption(pct: Record<string, number>): LensInfo {
  const v = Object.values(pct);
  const ready = v.filter(p => p >= 90).length;
  const coming = v.filter(p => p >= 50 && p < 90).length;
  const worn = v.filter(p => p < 50).length;
  return {
    title: 'READY',
    sub: 'Recovered muscles light up green',
    tone: C.live, from: 0.15, scale: 'TIRED → READY',
    chips: [
      { value: `${ready}`, label: 'READY' },
      { value: `${coming}`, label: 'COMING BACK' },
      { value: `${worn}`, label: 'WORN' },
    ],
  };
}
