// One day off TRAIN's calendar, to put right what was logged wrong or not at
// all. LIFTS lists what was done (× takes one off, through UNDO), and a picker
// shows the sessions one at a time, as SELECT does (lib/workout-dial.ts):
// swipe or ‹ › to one and ADD ticks it done on the day; the last card adds a
// single lift. FOOD and WATER are battery meters against the day's goal, with
// a flame and a drop; the pencil opens each one's editor (meals ×, + FOOD on
// FUEL for the day; water − / +). Runs are listed. A past day with nothing on
// it can be marked MISSED, so the twin assumes an average day instead of a
// day of no food and no water. Days ahead show the plan only. Every change
// calls onChanged: TRAIN redraws the calendar and recomputes the twin
// (muscles, targets, the coach's pick).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { C, F, MOD } from '@/lib/theme';
import { TAP, hit } from '@/lib/hit';
import { daysBetweenKeys, fromDateKey } from '@/lib/dateKey';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
import { useInFlight } from '@/lib/use-in-flight';
import { BALANCE } from '@/lib/text-wrap';
import { getDoneLog, getTemplates, getTrainingSessions, markDoneOn, removeLiftOn, type PlanDayValue } from '@/lib/workout-data';
import { getActivitiesInRange, formatDistance, formatDuration, type Activity } from '@/lib/activity-data';
import { getMealsForDate, deleteMeal, dailyTotals, getTargets, type Meal } from '@/lib/meals-data';
import { addWater, deleteWaterEntry, loadBodyData, waterOn, type WaterLog } from '@/lib/body-data';
import { setMissed } from '@/lib/missed-days';
import { executeAction } from '@/lib/actionExecutor';
import { FOCUS_TITLE, focusOfName } from '@/lib/coach';
import { ensureFocusTemplate } from '@/lib/routine';
import type { DialItem } from '@/lib/workout-dial';
import type { Session } from '@/lib/muscle-recovery';
import { Corners } from '@/components/Corners';
import { CyberIcon } from '@/components/CyberIcon';

type Day = {
  lifts: Session[]; runs: Activity[]; meals: Meal[]; water: WaterLog[];
  /** Templates ticked done that day, and the foci they are. */
  ticked: string[]; tickedFoci: string[]; kcalGoal: number; waterGoal: number;
};

const DOW = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const kg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pad2 = (n: number) => String(n).padStart(2, '0');

async function readDay(date: string, today: string): Promise<Day> {
  const d = fromDateKey(date)!;
  const end = new Date(d); end.setDate(end.getDate() + 1);
  const [sessions, runs, meals, body, done, targets, templates] = await Promise.all([
    getTrainingSessions(Math.max(1, daysBetweenKeys(date, today) + 1)).catch(() => [] as Session[]),
    getActivitiesInRange(d.toISOString(), end.toISOString()).catch(() => [] as Activity[]),
    getMealsForDate(date),
    loadBodyData(),
    getDoneLog(),
    getTargets(),
    getTemplates(),
  ]);
  const ticked = done.filter(e => e.date === date).map(e => e.templateId);
  const nameOf = Object.fromEntries(templates.map(t => [t.id, t.name]));
  return {
    lifts: sessions.filter(s => s.date === date),
    runs,
    meals,
    water: waterOn(body, date),
    ticked,
    tickedFoci: ticked.map(id => focusOfName(nameOf[id] ?? '')).filter((f): f is NonNullable<typeof f> => f != null),
    kcalGoal: targets.calories || 2000,
    waterGoal: body.waterGoalMl || 3000,
  };
}

export function DayPanel({ date, today, missed, plan, sessions, onChanged, onStart }: {
  date: string; today: string; missed: boolean; plan: PlanDayValue;
  /** The sessions to pick from, in SELECT's order. */
  sessions: DialItem[];
  onChanged: () => void;
  /** Today's planned session: open the workout. */
  onStart: () => void;
}) {
  const router = useRouter();
  const gone = usePendingRemovals();
  const [day, setDay] = useState<Day | null>(null);
  const [open, setOpen] = useState<'food' | 'water' | null>(null);

  const load = useCallback(() => { void readDay(date, today).then(setDay); }, [date, today]);
  useEffect(() => { setDay(null); setOpen(null); load(); }, [load]);

  const changed = () => { load(); onChanged(); };

  const d = fromDateKey(date)!;
  const ahead = date > today;
  const word = date === today ? 'TODAY' : daysBetweenKeys(date, today) === 1 ? 'YESTERDAY' : DOW[d.getDay()];
  const training = !!plan && plan !== 'rest' && plan !== 'cheat';
  const planned = training ? FOCUS_TITLE[plan] : plan === 'cheat' ? 'CHEAT DAY' : plan === 'rest' ? 'REST DAY' : null;

  const lifts = day?.lifts.filter(l => !gone.has(`lift:${l.exerciseId}:${date}`)) ?? [];
  const meals = day?.meals.filter(m => !gone.has(m.id)) ?? [];
  const water = day?.water.filter(w => !gone.has(`water:${w.at}`)) ?? [];
  const kcal = dailyTotals(meals).calories;
  const waterMl = water.reduce((a, w) => a + w.amountMl, 0);
  const empty = !!day && !lifts.length && !day.runs.length && !meals.length && !water.length;

  const undoable = (key: string, label: string, commit: () => unknown) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key, label, commit, after: changed });
  };

  async function drink(ml: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addWater(ml, date);
    changed();
  }

  async function mark(on: boolean) {
    void Haptics.selectionAsync();
    await setMissed(date, on);
    onChanged();
  }

  const toggle = (k: 'food' | 'water') => { void Haptics.selectionAsync(); setOpen(o => (o === k ? null : k)); };

  return (
    <View style={styles.panel}>
      <Corners size={10} color={C.lineHi} />
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{`${pad2(d.getDate())} ${MON[d.getMonth()]}`}</Text>
          <Text style={styles.title}>{word}</Text>
        </View>
        {planned && <Text style={[styles.plan, training && { color: C.ink }]}>{planned}</Text>}
      </View>

      {ahead ? (
        <Text style={styles.note} {...BALANCE}>
          {training ? `${planned} is on the plan. Log it on the day.` : 'Nothing planned. Log it on the day.'}
        </Text>
      ) : (
        <>
          {date === today && training && !lifts.length && (
            <Pressable onPress={onStart} style={({ pressed }) => [styles.start, pressed && { opacity: 0.85 }]}>
              <Text style={styles.startText}>{`START ${planned}`}</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color={C.onHot} />
            </Pressable>
          )}

          {(missed || (empty && date < today)) && (
            <View style={styles.missed}>
              <Text style={styles.missedText} {...BALANCE}>
                {missed
                  ? 'MISSED · YOUR AVERAGE FOOD AND WATER ARE ASSUMED, NOT ZERO'
                  : 'NOTHING LOGGED · MARK IT MISSED AND AN AVERAGE DAY IS ASSUMED'}
              </Text>
              <Pressable onPress={() => void mark(!missed)} style={({ pressed }) => [styles.key, !missed && styles.keyHot, pressed && { opacity: 0.8 }]}>
                <Text style={[styles.keyText, !missed && { color: C.onHot }]}>{missed ? 'UNMARK' : 'MISSED'}</Text>
              </Pressable>
            </View>
          )}

          {/* Lifts: what was done, then the picker */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <CyberIcon name="train" color={C.hot} size={16} />
              <Text style={styles.sectionLabel}>LIFTS</Text>
              {lifts.length > 0 && <Text style={styles.sectionValue}>{lifts.length}</Text>}
            </View>
            {lifts.map(l => (
              <Row key={l.exerciseId} text={l.name} value={`${Math.round(l.sets)}×${l.reps ?? '?'}${l.weightKg > 0 ? ` · ${kg(l.weightKg)} KG` : ''}`}
                tag={l.measured ? 'LOGGED' : 'PLANNED SETS'}
                onRemove={() => undoable(`lift:${l.exerciseId}:${date}`, `${l.name.toUpperCase()} REMOVED`, () => removeLiftOn(l.exerciseId, date))} />
            ))}
            {day && <Picker date={date} sessions={sessions} ticked={day.ticked} tickedFoci={day.tickedFoci} onDone={changed} />}
          </View>

          {/* Runs */}
          {!!day?.runs.length && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={[styles.swatch, { backgroundColor: C.live }]} />
                <Text style={styles.sectionLabel}>RUNS</Text>
              </View>
              {day.runs.map(r => (
                <Row key={r.id} text={r.type.toUpperCase()} value={`${formatDistance(r.distanceM)} · ${formatDuration(r.durationSecs)}`}
                  onPress={() => router.push({ pathname: '/activity-receipt', params: { id: r.id } })} />
              ))}
            </View>
          )}

          {/* Food and water: meters, the pencil opens the editor */}
          <Meter icon="flame" color={MOD.fuel} label="FOOD" value={kcal} goal={day?.kcalGoal ?? 2000}
            text={`${Math.round(kcal).toLocaleString('en-US')} / ${(day?.kcalGoal ?? 2000).toLocaleString('en-US')} KCAL`}
            over={C.alert} open={open === 'food'} onEdit={() => toggle('food')}>
            {meals.map(m => (
              <Row key={m.id} text={m.name} value={`${Math.round(m.calories)}`}
                onRemove={() => undoable(m.id, `${m.name.toUpperCase()} DELETED`, () => deleteMeal(date, m.id))} />
            ))}
            <View style={styles.chips}>
              <Chip label="+ FOOD" onPress={() => router.push({ pathname: '/calorie', params: { date } })} />
            </View>
          </Meter>

          <Meter icon="drop" color={MOD.water} label="WATER" value={waterMl} goal={day?.waterGoal ?? 3000}
            text={`${(waterMl / 1000).toFixed(2)} / ${((day?.waterGoal ?? 3000) / 1000).toFixed(1)} L`}
            open={open === 'water'} onEdit={() => toggle('water')}>
            <View style={styles.chips}>
              <Chip label="- LAST" disabled={!water.length} onPress={() => {
                const last = water[water.length - 1];
                if (last) undoable(`water:${last.at}`, `${last.amountMl} ML REMOVED`, () => deleteWaterEntry(last.at));
              }} />
              {[250, 500, 750].map(ml => <Chip key={ml} label={`+${ml}`} onPress={() => void drink(ml)} />)}
            </View>
          </Meter>
        </>
      )}
    </View>
  );
}

// ── the session picker ─────────────────────────────────────────────────────

/** SELECT's sessions one at a time, then a card to add a single lift. */
function Picker({ date, sessions, ticked, tickedFoci, onDone }: { date: string; sessions: DialItem[]; ticked: string[]; tickedFoci: string[]; onDone: () => void }) {
  const [w, setW] = useState(0);
  const [at, setAt] = useState(0);
  const [busy, once] = useInFlight();
  const scroll = useRef<ScrollView>(null);
  const cards = [...sessions.map(s => ({ kind: 'session' as const, s })), { kind: 'lift' as const }];
  const cur = cards[Math.min(at, cards.length - 1)];
  const isTicked = (s: DialItem) => ('templateId' in s.sel ? ticked.includes(s.sel.templateId) : tickedFoci.includes(s.sel.focus));

  const go = (i: number) => {
    const n = Math.max(0, Math.min(cards.length - 1, i));
    scroll.current?.scrollTo({ x: n * w, animated: true });
    if (n !== at) { setAt(n); void Haptics.selectionAsync(); }
  };

  const add = (s: DialItem) => once(async () => {
    const id = 'templateId' in s.sel ? s.sel.templateId : await ensureFocusTemplate(s.sel.focus);
    await markDoneOn(id, date);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone();
  });

  return (
    <View style={styles.picker}>
      <View style={styles.pickRow}>
        <Pressable onPress={() => go(at - 1)} disabled={at === 0} style={[styles.arrow, at === 0 && { opacity: 0.25 }]} accessibilityLabel="Previous session">
          <MaterialCommunityIcons name="chevron-left" size={20} color={C.ink} />
        </Pressable>
        <View style={{ flex: 1 }} onLayout={e => setW(e.nativeEvent.layout.width)}>
          {w > 0 && (
            <ScrollView
              ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => { const i = Math.round(e.nativeEvent.contentOffset.x / w); if (i !== at) { setAt(i); void Haptics.selectionAsync(); } }}
            >
              {cards.map((c, i) => (
                <View key={c.kind === 'session' ? c.s.key : 'lift'} style={[styles.card, { width: w }]}>
                  <Text style={styles.cardIdx}>{`${pad2(i + 1)}/${pad2(cards.length)}`}</Text>
                  <Text style={styles.cardTitle} numberOfLines={1}>{c.kind === 'session' ? c.s.title : 'ONE LIFT'}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {c.kind === 'session'
                      ? `${c.s.lifts} LIFTS${c.s.ready != null ? ` · ${c.s.ready}% READY` : ''}${isTicked(c.s) ? ' · DONE' : ''}`
                      : 'A SINGLE LIFT: WEIGHT, REPS, SETS'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        <Pressable onPress={() => go(at + 1)} disabled={at >= cards.length - 1} style={[styles.arrow, at >= cards.length - 1 && { opacity: 0.25 }]} accessibilityLabel="Next session">
          <MaterialCommunityIcons name="chevron-right" size={20} color={C.ink} />
        </Pressable>
      </View>
      {cur?.kind === 'lift'
        ? <LiftForm date={date} onDone={onDone} />
        : cur && (
          <Pressable onPress={() => add(cur.s)} disabled={busy || isTicked(cur.s)}
            style={({ pressed }) => [styles.add, (busy || isTicked(cur.s)) && { opacity: 0.3 }, pressed && { opacity: 0.85 }]}>
            <Text style={styles.addText} numberOfLines={1}>{isTicked(cur.s) ? `${cur.s.title} DONE` : `+ ADD ${cur.s.title}`}</Text>
          </Pressable>
        )}
    </View>
  );
}

// ── pieces ─────────────────────────────────────────────────────────────────

/** A battery meter against a goal: an icon, cells filled to the share of it, the figure, a pencil. */
function Meter({ icon, color, over, label, value, goal, text, open, onEdit, children }: {
  icon: 'flame' | 'drop'; color: string; over?: string; label: string; value: number; goal: number; text: string;
  open: boolean; onEdit: () => void; children: ReactNode;
}) {
  const CELLS = 12;
  const share = goal > 0 ? value / goal : 0;
  const lit = Math.min(CELLS, Math.round(share * CELLS));
  const tone = over && share > 1.1 ? over : color;
  return (
    <View style={styles.section}>
      <View style={styles.meterRow}>
        <CyberIcon name={icon} color={tone} size={18} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={styles.meterHead}>
            <Text style={styles.sectionLabel}>{label}</Text>
            <Text style={styles.meterText}>{text}</Text>
          </View>
          <View style={styles.battery} accessibilityLabel={`${label} ${Math.round(share * 100)} percent of goal`}>
            <View style={styles.cells}>
              {Array.from({ length: CELLS }, (_, i) => (
                <View key={i} style={[styles.cell, { backgroundColor: i < lit ? tone : C.ghost }]} />
              ))}
            </View>
            <View style={styles.nub} />
          </View>
        </View>
        <Text style={[styles.pct, { color: tone }]}>{`${Math.round(share * 100)}%`}</Text>
        <Pressable onPress={onEdit} hitSlop={hit(36)} style={[styles.edit, open && styles.editOn]} accessibilityLabel={`Edit ${label.toLowerCase()}`}>
          <CyberIcon name="pencil" color={open ? C.onHot : C.ink} size={16} />
        </Pressable>
      </View>
      {open && <View style={styles.editor}>{children}</View>}
    </View>
  );
}

function Row({ text, value, tag, onRemove, onPress }: { text: string; value: string; tag?: string; onRemove?: () => void; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.raised }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowText} numberOfLines={1}>{text}</Text>
        {!!tag && <Text style={styles.rowTag}>{tag}</Text>}
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={hit(18)} accessibilityLabel={`Remove ${text}`}>
          <MaterialCommunityIcons name="close" size={16} color={C.faint} />
        </Pressable>
      )}
      {onPress && <MaterialCommunityIcons name="chevron-right" size={16} color={C.faint} />}
    </Pressable>
  );
}

function Chip({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={hit(60, 36, 4)}
      style={({ pressed }) => [styles.chip, disabled && { opacity: 0.25 }, pressed && { backgroundColor: C.raised }]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const num = (s: string) => parseFloat(s.replace(',', '.'));

/** A single lift on the day: what, how heavy, how many, how many sets. */
function LiftForm({ date, onDone }: { date: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('3');
  const [busy, once] = useInFlight();
  const ok = name.trim() && num(reps) > 0 && num(sets) > 0 && !(num(weight) < 0);

  const save = () => once(async () => {
    try {
      for (let i = 0; i < Math.min(20, Math.round(num(sets))); i++) {
        await executeAction({ type: 'log_set', status: 'auto', data: { exercise: name.trim(), weightKg: num(weight) || 0, reps: Math.round(num(reps)), date } });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName(''); setWeight(''); setReps('');
      onDone();
    } catch (e) {
      Alert.alert("Couldn't add that lift", e instanceof Error ? e.message : 'Try again when you have a connection.');
    }
  });

  return (
    <View style={styles.form}>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Lift, e.g. bench press" placeholderTextColor={C.faint} />
      <View style={styles.fields}>
        <Field value={weight} onChange={setWeight} unit="KG" />
        <Field value={reps} onChange={setReps} unit="REPS" />
        <Field value={sets} onChange={setSets} unit="SETS" />
      </View>
      <Pressable onPress={save} disabled={!ok || busy} style={({ pressed }) => [styles.add, (!ok || busy) && { opacity: 0.3 }, pressed && { opacity: 0.85 }]}>
        <Text style={styles.addText}>+ ADD LIFT</Text>
      </Pressable>
    </View>
  );
}

function Field({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <View style={styles.field}>
      <TextInput style={styles.fieldInput} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.faint} selectTextOnFocus />
      <Text style={styles.fieldUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, marginBottom: 4 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  title: { fontFamily: F.dot, fontSize: 22, color: C.ink, letterSpacing: 1.5, marginTop: 2 },
  plan: { fontFamily: F.dot, fontSize: 10, color: C.faint, letterSpacing: 1.5, marginBottom: 4 },
  note: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingHorizontal: 16, paddingTop: 6, lineHeight: 18 },

  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: TAP, marginHorizontal: 16, marginTop: 8, backgroundColor: C.hot },
  startText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },

  missed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.lineHi, borderStyle: 'dashed' },
  missedText: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.2, lineHeight: 14 },
  key: { minHeight: 36, paddingHorizontal: 14, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  keyHot: { backgroundColor: C.hot, borderColor: C.hot },
  keyText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },

  section: { paddingTop: 14, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  swatch: { width: 8, height: 8 },
  sectionLabel: { flex: 1, fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  sectionValue: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowText: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  rowTag: { fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1.2, marginTop: 2 },
  rowValue: { fontFamily: F.dot, fontSize: 12, color: C.ink, maxWidth: '45%' },

  picker: { marginTop: 10, gap: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: C.lineHi, backgroundColor: C.bg },
  arrow: { width: 36, alignItems: 'center', justifyContent: 'center' },
  card: { paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 3 },
  cardIdx: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1 },
  cardTitle: { fontFamily: F.dot, fontSize: 16, color: C.ink, letterSpacing: 1.5 },
  cardSub: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
  add: { minHeight: TAP, alignItems: 'center', justifyContent: 'center', backgroundColor: C.hot, paddingHorizontal: 12 },
  addText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },

  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meterHead: { flexDirection: 'row', alignItems: 'baseline' },
  meterText: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  battery: { flexDirection: 'row', alignItems: 'center' },
  cells: { flex: 1, flexDirection: 'row', gap: 2, padding: 2, borderWidth: 1, borderColor: C.lineHi },
  cell: { flex: 1, height: 10 },
  nub: { width: 3, height: 7, backgroundColor: C.lineHi },
  pct: { fontFamily: F.dot, fontSize: 12, width: 40, textAlign: 'right' },
  edit: { width: 36, height: 36, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  editOn: { backgroundColor: C.hot, borderColor: C.hot },
  editor: { marginTop: 8, paddingLeft: 28 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10 },
  chip: { minHeight: 36, minWidth: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.2 },

  form: { gap: 8 },
  input: { minHeight: TAP, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, fontFamily: F.mono, fontSize: 14, color: C.ink },
  fields: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: TAP, paddingHorizontal: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  fieldInput: { flex: 1, fontFamily: F.dot, fontSize: 16, color: C.ink, paddingVertical: 8 },
  fieldUnit: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
});
