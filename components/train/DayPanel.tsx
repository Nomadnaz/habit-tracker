// One day off TRAIN's calendar, to put right what was logged wrong or not at
// all: its lifts (× takes one off; tick a workout or add a single lift), its
// runs, food (× a meal, + FOOD opens FUEL on the day), water (− / +) and
// weigh-ins. Removing goes through UNDO like everywhere else. A past day with
// nothing on it can be marked MISSED, so the twin assumes an average day
// instead of a day of no food and no water. Days ahead show the plan only.
// Every change calls onChanged: TRAIN redraws the calendar and recomputes
// the twin (muscles, targets, the coach's pick).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { C, F, MOD } from '@/lib/theme';
import { TAP, hit } from '@/lib/hit';
import { daysBetweenKeys, fromDateKey, toDateKey } from '@/lib/dateKey';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
import { useInFlight } from '@/lib/use-in-flight';
import { BALANCE } from '@/lib/text-wrap';
import {
  getDoneLog, getTemplates, getTrainingSessions, markDoneOn, removeLiftOn, type PlanDayValue, type WorkoutTemplate,
} from '@/lib/workout-data';
import { getActivitiesInRange, formatDistance, formatDuration, type Activity } from '@/lib/activity-data';
import { getMealsForDate, deleteMeal, dailyTotals, type Meal } from '@/lib/meals-data';
import {
  addWater, deleteWaterEntry, deleteWeightEntry, loadBodyData, logWeight, waterOn, type WaterLog, type WeightLog,
} from '@/lib/body-data';
import { setMissed } from '@/lib/missed-days';
import { executeAction } from '@/lib/actionExecutor';
import { FOCUS_TITLE } from '@/lib/coach';
import type { Session } from '@/lib/muscle-recovery';

type Day = {
  lifts: Session[]; runs: Activity[]; meals: Meal[]; water: WaterLog[]; weights: WeightLog[];
  templates: WorkoutTemplate[]; ticked: string[];
};

const DOW = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const kg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

async function readDay(date: string, today: string): Promise<Day> {
  const d = fromDateKey(date)!;
  const end = new Date(d); end.setDate(end.getDate() + 1);
  const [sessions, runs, meals, body, templates, done] = await Promise.all([
    getTrainingSessions(Math.max(1, daysBetweenKeys(date, today) + 1)).catch(() => [] as Session[]),
    getActivitiesInRange(d.toISOString(), end.toISOString()).catch(() => [] as Activity[]),
    getMealsForDate(date),
    loadBodyData(),
    getTemplates(),
    getDoneLog(),
  ]);
  return {
    lifts: sessions.filter(s => s.date === date),
    runs,
    meals,
    water: waterOn(body, date),
    weights: body.weightLogs.filter(w => toDateKey(new Date(w.at)) === date),
    templates: templates.filter(t => !t.isArchived),
    ticked: done.filter(e => e.date === date).map(e => e.templateId),
  };
}

export function DayPanel({ date, today, missed, plan, onChanged, onStart }: {
  date: string; today: string; missed: boolean; plan: PlanDayValue;
  onChanged: () => void;
  /** Today's planned session: open the workout. */
  onStart: () => void;
}) {
  const router = useRouter();
  const gone = usePendingRemovals();
  const [day, setDay] = useState<Day | null>(null);
  const [adding, setAdding] = useState<'lift' | 'weight' | null>(null);

  const load = useCallback(() => { void readDay(date, today).then(setDay); }, [date, today]);
  useEffect(() => { setDay(null); setAdding(null); load(); }, [load]);

  const changed = () => { load(); onChanged(); };

  const d = fromDateKey(date)!;
  const ahead = date > today;
  const word = date === today ? 'TODAY' : daysBetweenKeys(date, today) === 1 ? 'YESTERDAY' : DOW[d.getDay()];
  const planned = plan && plan !== 'rest' && plan !== 'cheat' ? FOCUS_TITLE[plan] : plan === 'cheat' ? 'CHEAT DAY' : plan === 'rest' ? 'REST DAY' : null;

  const lifts = day?.lifts.filter(l => !gone.has(`lift:${l.exerciseId}:${date}`)) ?? [];
  const meals = day?.meals.filter(m => !gone.has(m.id)) ?? [];
  const water = day?.water.filter(w => !gone.has(`water:${w.at}`)) ?? [];
  const weights = day?.weights.filter(w => !gone.has(`weight:${w.at}`)) ?? [];
  const kcal = dailyTotals(meals).calories;
  const waterMl = water.reduce((a, w) => a + w.amountMl, 0);
  const empty = !!day && !lifts.length && !day.runs.length && !meals.length && !water.length && !weights.length;

  const undoable = (key: string, label: string, commit: () => unknown) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key, label, commit, after: changed });
  };

  async function tick(t: WorkoutTemplate) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markDoneOn(t.id, date);
    changed();
  }

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

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{`${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`}</Text>
          <Text style={styles.title}>{word}</Text>
        </View>
        {planned && <Text style={[styles.plan, plan !== 'rest' && plan !== 'cheat' && { color: C.ink }]}>{planned}</Text>}
      </View>

      {ahead ? (
        <Text style={styles.note} {...BALANCE}>
          {planned && plan !== 'rest' && plan !== 'cheat' ? `${planned} is on the plan. Log it on the day.` : 'Nothing planned. Log it on the day.'}
        </Text>
      ) : (
        <>
          {date === today && planned && plan !== 'rest' && plan !== 'cheat' && !lifts.length && (
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
              <Pressable onPress={() => void mark(!missed)} style={({ pressed }) => [styles.key, missed ? null : styles.keyHot, pressed && { opacity: 0.8 }]}>
                <Text style={[styles.keyText, !missed && { color: C.onHot }]}>{missed ? 'UNMARK' : 'MISSED'}</Text>
              </Pressable>
            </View>
          )}

          {/* Lifts */}
          <Section label="LIFTS" value={lifts.length ? `${lifts.length}` : undefined} color={C.hot}>
            {lifts.map(l => (
              <Row key={l.exerciseId} text={l.name} value={`${Math.round(l.sets)}×${l.reps ?? '?'}${l.weightKg > 0 ? ` · ${kg(l.weightKg)} KG` : ''}`}
                tag={l.measured ? 'LOGGED' : 'PLANNED SETS'}
                onRemove={() => undoable(`lift:${l.exerciseId}:${date}`, `${l.name.toUpperCase()} REMOVED`, () => removeLiftOn(l.exerciseId, date))} />
            ))}
            <View style={styles.chips}>
              {day?.templates.filter(t => !day.ticked.includes(t.id)).map(t => (
                <Chip key={t.id} label={`+ ${t.name.toUpperCase()}`} onPress={() => void tick(t)} />
              ))}
              <Chip label="+ ONE LIFT" on={adding === 'lift'} onPress={() => setAdding(a => (a === 'lift' ? null : 'lift'))} />
            </View>
            {adding === 'lift' && <LiftForm date={date} onDone={() => { setAdding(null); changed(); }} />}
          </Section>

          {/* Runs */}
          {!!day?.runs.length && (
            <Section label="RUNS" value={`${day.runs.length}`} color={C.live}>
              {day.runs.map(r => (
                <Row key={r.id} text={r.type.toUpperCase()} value={`${formatDistance(r.distanceM)} · ${formatDuration(r.durationSecs)}`}
                  onPress={() => router.push({ pathname: '/activity-receipt', params: { id: r.id } })} />
              ))}
            </Section>
          )}

          {/* Food */}
          <Section label="FOOD" value={meals.length ? `${Math.round(kcal).toLocaleString('en-US')} KCAL` : undefined} color={MOD.fuel}>
            {meals.map(m => (
              <Row key={m.id} text={m.name} value={`${Math.round(m.calories)}`}
                onRemove={() => undoable(m.id, `${m.name.toUpperCase()} DELETED`, () => deleteMeal(date, m.id))} />
            ))}
            <View style={styles.chips}>
              <Chip label="+ FOOD" onPress={() => router.push({ pathname: '/calorie', params: { date } })} />
            </View>
          </Section>

          {/* Water */}
          <Section label="WATER" value={`${(waterMl / 1000).toFixed(2)} L`} color={MOD.water}>
            <View style={styles.chips}>
              <Chip label="−" disabled={!water.length} onPress={() => {
                const last = water[water.length - 1];
                if (last) undoable(`water:${last.at}`, `${last.amountMl} ML REMOVED`, () => deleteWaterEntry(last.at));
              }} />
              {[250, 500, 750].map(ml => <Chip key={ml} label={`+${ml}`} onPress={() => void drink(ml)} />)}
            </View>
          </Section>

          {/* Weight */}
          <Section label="WEIGHT" value={weights.length ? `${kg(weights[weights.length - 1].weightKg)} KG` : undefined} color={MOD.weight}>
            {weights.map(w => (
              <Row key={w.at} text="Weigh-in" value={`${kg(w.weightKg)} KG`}
                onRemove={() => undoable(`weight:${w.at}`, 'WEIGH-IN REMOVED', () => deleteWeightEntry(w.at))} />
            ))}
            {adding === 'weight'
              ? <WeightForm date={date} onDone={() => { setAdding(null); changed(); }} />
              : <View style={styles.chips}><Chip label="+ WEIGH-IN" onPress={() => setAdding('weight')} /></View>}
          </Section>
        </>
      )}
    </View>
  );
}

function Section({ label, value, color, children }: { label: string; value?: string; color: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={styles.sectionLabel}>{label}</Text>
        {!!value && <Text style={styles.sectionValue}>{value}</Text>}
      </View>
      {children}
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

function Chip({ label, on, disabled, onPress }: { label: string; on?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={hit(60, 36, 4)}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, disabled && { opacity: 0.25 }, pressed && { opacity: 0.75 }]}>
      <Text style={[styles.chipText, on && { color: C.onHot }]}>{label}</Text>
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
      onDone();
    } catch (e) {
      Alert.alert("Couldn't add that lift", e instanceof Error ? e.message : 'Try again when you have a connection.');
    }
  });

  return (
    <View style={styles.form}>
      <TextInput style={[styles.input, { flex: 1, minWidth: '100%' }]} value={name} onChangeText={setName} placeholder="Lift, e.g. bench press" placeholderTextColor={C.faint} autoFocus />
      <Field value={weight} onChange={setWeight} unit="KG" />
      <Field value={reps} onChange={setReps} unit="REPS" />
      <Field value={sets} onChange={setSets} unit="SETS" />
      <Pressable onPress={save} disabled={!ok || busy} style={({ pressed }) => [styles.save, (!ok || busy) && { opacity: 0.3 }, pressed && { opacity: 0.8 }]}>
        <Text style={styles.saveText}>ADD</Text>
      </Pressable>
    </View>
  );
}

function WeightForm({ date, onDone }: { date: string; onDone: () => void }) {
  const [value, setValue] = useState('');
  const [busy, once] = useInFlight();
  const ok = num(value) > 0;
  const save = () => once(async () => {
    await logWeight(num(value), date);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone();
  });
  return (
    <View style={styles.form}>
      <Field value={value} onChange={setValue} unit="KG" autoFocus />
      <Pressable onPress={save} disabled={!ok || busy} style={({ pressed }) => [styles.save, (!ok || busy) && { opacity: 0.3 }, pressed && { opacity: 0.8 }]}>
        <Text style={styles.saveText}>SAVE</Text>
      </Pressable>
    </View>
  );
}

function Field({ value, onChange, unit, autoFocus }: { value: string; onChange: (v: string) => void; unit: string; autoFocus?: boolean }) {
  return (
    <View style={styles.field}>
      <TextInput style={styles.fieldInput} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.faint} selectTextOnFocus autoFocus={autoFocus} />
      <Text style={styles.fieldUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: 18, borderCurve: 'continuous', backgroundColor: C.surface, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, marginBottom: 6 },
  eyebrow: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2 },
  title: { fontFamily: F.dot, fontSize: 22, color: C.ink, letterSpacing: 1.5, marginTop: 2 },
  plan: { fontFamily: F.dot, fontSize: 10, color: C.faint, letterSpacing: 1.5, marginBottom: 4 },
  note: { fontFamily: F.mono, fontSize: 12, color: C.dim, paddingHorizontal: 16, paddingTop: 6, lineHeight: 18 },

  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: TAP, marginHorizontal: 16, marginTop: 8, borderRadius: 999, backgroundColor: C.hot },
  startText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },

  missed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 10, padding: 12, borderWidth: 1, borderColor: C.lineHi, borderStyle: 'dashed', borderRadius: 12, borderCurve: 'continuous' },
  missedText: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1.2, lineHeight: 14 },
  key: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  keyHot: { backgroundColor: C.hot, borderColor: C.hot },
  keyText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },

  section: { paddingTop: 14, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  sectionLabel: { flex: 1, fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  sectionValue: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowText: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  rowTag: { fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1.2, marginTop: 2 },
  rowValue: { fontFamily: F.dot, fontSize: 12, color: C.ink, maxWidth: '45%' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10 },
  chip: { minHeight: 36, minWidth: 48, paddingHorizontal: 12, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.hot, borderColor: C.hot },
  chipText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.2 },

  form: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, alignItems: 'center' },
  input: { minHeight: TAP, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, fontFamily: F.mono, fontSize: 14, color: C.ink },
  field: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: TAP, paddingHorizontal: 10, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  fieldInput: { width: 44, fontFamily: F.dot, fontSize: 16, color: C.ink, paddingVertical: 8 },
  fieldUnit: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
  save: { minHeight: TAP, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  saveText: { fontFamily: F.dot, fontSize: 11, color: C.onHot, letterSpacing: 2 },
});
