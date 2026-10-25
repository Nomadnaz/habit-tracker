// BODY's sheets: how the twin got each target (a ledger of base + every
// adjustment), readiness in full, the week ahead, and the goal picker, which
// re-runs the twin live as you tap so you see what a goal would do first.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F, numFace } from '@/lib/theme';
import { TAP } from '@/lib/hit';
import { PRETTY } from '@/lib/text-wrap';
import { buildTwin, GOALS, goalWord, hm, PACES, paceWord, type Line, type TwinGoal, type TwinInput } from '@/lib/twin';
import { LEVEL } from '@/lib/coach';
import type { TodayView } from '@/lib/twin-data';
import { Sheet } from './bits';

export type SheetKind = 'steps' | 'water' | 'fuel' | 'sleep' | 'readiness' | 'week' | 'goal';
export type DeckActions = {
  open: (s: SheetKind) => void;
  go: (path: string, params?: Record<string, string>) => void;
  addWater: (ml: number) => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number, unit = '') => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}${unit}`;

export function TodaySheet({ kind, view, input, act, onClose, onGoal, spot }: {
  kind: SheetKind | null;
  spot?: React.ReactNode;
  view: TodayView;
  input: TwinInput | null;
  act: DeckActions;
  onClose: () => void;
  onGoal: (g: TwinGoal, you: You | null) => void;
}) {
  // Keep the last kind while the sheet slides away.
  const [shown, setShown] = useState<SheetKind | null>(kind);
  useEffect(() => { if (kind) setShown(kind); }, [kind]);
  return (
    <Sheet visible={!!kind} onClose={onClose} spot={spot}>
      {shown && <Body kind={shown} view={view} input={input} act={act} onClose={onClose} onGoal={onGoal} />}
    </Sheet>
  );
}

function Body({ kind, view, input, act, onClose, onGoal }: {
  kind: SheetKind; view: TodayView; input: TwinInput | null; act: DeckActions; onClose: () => void; onGoal: (g: TwinGoal, you: You | null) => void;
}) {
  const t = view.twin;
  const go = (path: string) => { onClose(); setTimeout(() => act.go(path), 180); };
  switch (kind) {
    case 'steps':
      return (
        <Target
          word="STEPS" value={fmt(t.steps.value)} unit="" lines={t.steps.lines} unitOf={n => fmt(n)}
          done={`${fmt(view.now.steps)} so far · ${Math.round((view.now.steps / t.steps.value) * 100)}%`}
          actions={[{ label: 'OPEN STEPS', onPress: () => go('/steps') }]}
        />
      );
    case 'water':
      return (
        <Target
          word="WATER" value={fmt(t.water.value)} unit="ML" lines={t.water.lines} unitOf={n => `${fmt(n)} ml`}
          done={`${fmt(view.now.waterMl)} ml so far · ${Math.round((view.now.waterMl / t.water.value) * 100)}%`}
          actions={[250, 500, 750].map(ml => ({ label: `+${ml}`, onPress: () => act.addWater(ml) }))}
        />
      );
    case 'fuel':
      return (
        <Target
          word="FUEL" value={fmt(t.fuel.value)} unit="KCAL" lines={t.fuel.lines} unitOf={n => `${fmt(n)}`}
          done={`${fmt(view.now.kcal)} eaten · ${fmt(Math.max(0, t.fuel.value - view.now.kcal))} left`}
          extra={
            <View style={st.macros}>
              {([['PROTEIN', t.fuel.proteinG, view.now.proteinG], ['CARBS', t.fuel.carbsG, view.now.carbsG], ['FAT', t.fuel.fatG, view.now.fatG]] as const).map(([k, want, have]) => (
                <View key={k} style={st.macro}>
                  <Text style={st.macroWord}>{k}</Text>
                  <Text style={st.macroVal}>{want}<Text style={st.macroUnit}>G</Text></Text>
                  <Text style={st.macroHave}>{Math.round(have)} eaten</Text>
                </View>
              ))}
            </View>
          }
          actions={[{ label: 'LOG FOOD', onPress: () => go('/calorie') }]}
        />
      );
    case 'sleep':
      return (
        <Target
          word="SLEEP" value={hm(t.sleep.value)} unit="" lines={t.sleep.lines} unitOf={n => `${n} min`} baseOf={hm}
          done={`in bed ${t.sleep.bed} · up ${t.sleep.wake} · last night ${view.now.sleepMin == null ? 'not tracked' : hm(view.now.sleepMin).toLowerCase()}`}
        />
      );
    case 'readiness': {
      const r = view.today.readiness;
      return (
        <View>
          <Text style={st.eyebrow}>READINESS</Text>
          <View style={st.bigRow}>
            <Text style={st.big}>{r.score}</Text>
            <Text style={st.level}>{LEVEL[r.level].word}</Text>
          </View>
          <Text style={st.note} {...PRETTY}>{LEVEL[r.level].dose}</Text>
          <Text style={st.section}>WHAT WENT IN</Text>
          {r.factors.map(f => (
            <View key={f.id} style={st.factor}>
              <View style={{ flex: 1 }}>
                <Text style={st.factorWord}>{f.label}</Text>
                <Text style={st.factorNote}>{f.note}</Text>
              </View>
              <Text style={st.factorVal}>{f.value}</Text>
            </View>
          ))}
          {[...r.flags, ...view.today.reasons].map((x, i) => <Text key={i} style={st.flag}>› {x}</Text>)}
        </View>
      );
    }
    case 'week':
      return (
        <View>
          <Text style={st.eyebrow}>THE WEEK AHEAD</Text>
          <View style={[st.weekRow, st.weekHead]}>
            {['DAY', 'PLAN', 'KCAL', 'STEPS', 'WATER', 'SLEEP'].map((h, i) => <Text key={h} style={[st.weekH, i === 1 && { flex: 2.4 }]}>{h}</Text>)}
          </View>
          {t.week.map(d => (
            <View key={d.key} style={[st.weekRow, d.today && st.weekToday]}>
              <Text style={[st.weekDow, d.today && { color: C.hot }]}>{d.dow}</Text>
              <View style={{ flex: 2.4 }}>
                <Text style={[st.weekPlan, !d.focus && { color: C.dim }]}>{d.word}{d.done ? '  DONE' : ''}</Text>
                {!!d.extra && <Text style={st.weekExtra}>{d.extra}</Text>}
              </View>
              <Text style={st.weekNum}>{fmt(d.kcal)}</Text>
              <Text style={st.weekNum}>{Math.round(d.steps / 100) / 10}k</Text>
              <Text style={st.weekNum}>{Math.round(d.waterMl / 50) / 20}L</Text>
              <Text style={st.weekNum}>{hm(d.sleepMin).toLowerCase()}</Text>
            </View>
          ))}
          <Text style={st.foot} {...PRETTY}>Days ahead are a projection. Each morning the twin re-plans from what you actually did, slept and ate.</Text>
        </View>
      );
    case 'goal':
      return <GoalPicker current={t.goal} input={input} onSet={(g, you) => { onGoal(g, you); onClose(); }} />;
  }
}

/** A target and its working: base, each adjustment, the total. */
function Target({ word, value, unit, lines, unitOf, baseOf, done, extra, actions = [] }: {
  word: string; value: string; unit: string; lines: Line[]; unitOf: (n: number) => string; baseOf?: (n: number) => string;
  done: string; extra?: React.ReactNode; actions?: { label: string; onPress: () => void }[];
}) {
  return (
    <View>
      <View style={st.eyeRow}>
        <Text style={st.eyebrow}>{word}</Text>
        <Text style={st.auto}>SET BY YOUR TWIN</Text>
      </View>
      <View style={st.bigRow}>
        <Text style={[st.big, numFace(value, 46)]}>{value}</Text>
        {!!unit && <Text style={st.bigUnit}>{unit}</Text>}
      </View>
      <Text style={st.note}>{done}</Text>
      {extra}
      <Text style={st.section}>WORKING</Text>
      {lines.map((l, i) => (
        <View key={i} style={st.ledger}>
          <Text style={st.ledgerLabel} numberOfLines={1}>{l.label}</Text>
          <Text style={st.leader} numberOfLines={1} ellipsizeMode="clip">{'·'.repeat(60)}</Text>
          <Text style={[st.ledgerVal, i > 0 && { color: l.delta >= 0 ? C.live : C.ink }]}>
            {i === 0 ? (baseOf ? baseOf(l.delta) : unitOf(l.delta)) : signed(l.delta, unitOf(1).replace(/^1/, ''))}
          </Text>
        </View>
      ))}
      <View style={[st.ledger, st.ledgerTotal]}>
        <Text style={[st.ledgerLabel, { color: C.hot }]}>TODAY</Text>
        <Text style={st.leader} numberOfLines={1} ellipsizeMode="clip">{'·'.repeat(60)}</Text>
        <Text style={[st.ledgerVal, { color: C.hot }]}>{value}{unit ? ` ${unit}` : ''}</Text>
      </View>
      {actions.length > 0 && (
        <View style={st.actions}>
          {actions.map(a => (
            <Pressable key={a.label} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); a.onPress(); }}
              style={({ pressed }) => [st.action, pressed && st.actionOn]}>
              <Text style={st.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={st.foot} {...PRETTY}>Re-planned each time you open TODAY, from your goal, recovery, sleep, yesterday and your trend.</Text>
    </View>
  );
}

/** Your numbers, as edited in the goal sheet. */
export type You = { age: number | null; heightCm: number | null; weightKg: number | null; goalWeightKg: number | null; sex: string | null };

const num = (s: string) => { const x = parseFloat(s.replace(',', '.')); return Number.isFinite(x) && x > 0 ? x : null; };
const str = (x: number | null | undefined) => (x == null ? '' : String(x));

function GoalPicker({ current, input, onSet }: { current: TwinGoal; input: TwinInput | null; onSet: (g: TwinGoal, you: You | null) => void }) {
  const [draft, setDraft] = useState<TwinGoal>(current);
  const p = input?.profile;
  const lastKg = input ? [...input.weights].sort((a, b) => a.at.localeCompare(b.at)).pop()?.kg ?? p?.weightKg ?? null : null;
  const [f, setF] = useState({ age: str(p?.age), cm: str(p?.heightCm), kg: str(lastKg), goal: str(p?.goalWeightKg) });
  const [sex, setSex] = useState<string | null>(p?.sex ?? null);
  const you: You = { age: num(f.age), heightCm: num(f.cm), weightKg: num(f.kg), goalWeightKg: num(f.goal), sex };
  const changed = !!p && (you.age !== p.age || you.heightCm !== p.heightCm || you.weightKg !== lastKg || you.goalWeightKg !== p.goalWeightKg || sex !== p.sex);
  const preview = useMemo(() => (input ? buildTwin({
    ...input, goal: draft,
    profile: { ...input.profile, age: you.age, heightCm: you.heightCm, sex, goalWeightKg: you.goalWeightKg, weightKg: you.weightKg },
    weights: you.weightKg != null && you.weightKg !== lastKg ? [] : input.weights,
  }) : null), [input, draft, f, sex]);
  const pick = (g: Partial<TwinGoal>) => { void Haptics.selectionAsync(); setDraft(d => ({ ...d, ...g })); };
  return (
    <View>
      <Text style={st.eyebrow}>YOUR GOAL</Text>
      <View style={st.goals}>
        {GOALS.map(g => {
          const on = draft.id === g.id;
          return (
            <Pressable key={g.id} onPress={() => pick({ id: g.id })} style={[st.goalKey, on && st.goalKeyOn]}>
              <Text style={[st.goalWord, on && { color: C.onHot }]}>{g.word}</Text>
              <Text style={[st.goalLine, on && { color: C.onHot }]}>{g.line}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={st.section}>PACE</Text>
      <View style={st.paces}>
        {PACES.map(p => {
          const on = draft.pace === p.id;
          return (
            <Pressable key={p.id} onPress={() => pick({ pace: p.id })} style={[st.paceKey, on && st.goalKeyOn]}>
              <Text style={[st.goalWord, { fontSize: 11 }, on && { color: C.onHot }]}>{p.word}</Text>
              <Text style={[st.goalLine, on && { color: C.onHot }]}>{p.line}</Text>
            </Pressable>
          );
        })}
      </View>
      {preview && (
        <View style={st.preview}>
          <View style={st.eyeRow}>
            <Text style={st.previewWord}>{goalWord(draft.id)} {paceWord(draft.pace)}</Text>
            <Text style={[st.previewHead, numFace(preview.outlook.headline, 16)]}>{preview.outlook.headline}</Text>
          </View>
          <Text style={st.previewSub}>{preview.outlook.sub}</Text>
          <Text style={st.previewSub}>
            Today: {fmt(preview.fuel.value)} kcal · {preview.fuel.proteinG} g protein · {fmt(preview.steps.value)} steps · bed {preview.sleep.bed}
          </Text>
        </View>
      )}
      <Text style={st.section}>YOU</Text>
      <View style={st.you}>
        {([['AGE', 'age', 'number-pad'], ['HEIGHT CM', 'cm', 'number-pad'], ['WEIGHT KG', 'kg', 'decimal-pad'], ['GOAL KG', 'goal', 'decimal-pad']] as const).map(([label, k, pad]) => (
          <View key={k} style={st.field}>
            <Text style={st.fieldWord}>{label}</Text>
            <TextInput
              value={f[k]} onChangeText={v => setF(x => ({ ...x, [k]: v }))} keyboardType={pad} placeholder="--"
              placeholderTextColor={C.faint} style={st.fieldInput} maxLength={5} selectionColor={C.hot}
            />
          </View>
        ))}
      </View>
      <View style={[st.paces, { marginTop: 8 }]}>
        {(['Male', 'Female'] as const).map(x => (
          <Pressable key={x} onPress={() => { void Haptics.selectionAsync(); setSex(s => (s === x ? null : x)); }} style={[st.sexKey, sex === x && st.goalKeyOn]}>
            <Text style={[st.goalWord, { fontSize: 10 }, sex === x && { color: C.onHot }]}>{x.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onSet(draft, changed ? you : null); }}
        style={({ pressed }) => [st.setKey, pressed && { opacity: 0.85 }]}>
        <Text style={st.setText}>SET GOAL</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  eyeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  auto: { fontFamily: F.dot, fontSize: 8, color: C.live, letterSpacing: 1.6 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  big: { fontFamily: F.dot, fontSize: 46, color: C.hot },
  bigUnit: { fontFamily: F.dot, fontSize: 14, color: C.dim, letterSpacing: 1 },
  level: { fontFamily: F.dot, fontSize: 16, color: C.live, letterSpacing: 2 },
  note: { fontFamily: F.mono, fontSize: 12, color: C.dim, marginTop: 2 },
  section: { fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 2.5, marginTop: 18, marginBottom: 8 },

  ledger: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 4 },
  ledgerTotal: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 4, paddingTop: 9 },
  ledgerLabel: { fontFamily: F.mono, fontSize: 11, color: C.ink, flexShrink: 1, maxWidth: '70%' },
  leader: { flex: 1, fontFamily: F.mono, fontSize: 11, color: C.faint },
  ledgerVal: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 0.5 },

  macros: { flexDirection: 'row', gap: 8, marginTop: 14 },
  macro: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, borderCurve: 'continuous', padding: 10, gap: 3 },
  macroWord: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.6 },
  macroVal: { fontFamily: F.dot, fontSize: 18, color: C.hot },
  macroUnit: { fontSize: 10, color: C.dim },
  macroHave: { fontFamily: F.mono, fontSize: 10, color: C.dim },

  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: { flex: 1, height: 44, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised },
  actionOn: { backgroundColor: C.hot, borderColor: C.hot },
  actionText: { fontFamily: F.dot, fontSize: 12, color: C.ink, letterSpacing: 1.6 },
  foot: { fontFamily: F.mono, fontSize: 10, color: C.faint, marginTop: 16, lineHeight: 14 },

  factor: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
  factorWord: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  factorNote: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 2 },
  factorVal: { fontFamily: F.dot, fontSize: 18, color: C.hot },
  flag: { fontFamily: F.mono, fontSize: 11, color: C.ink, marginTop: 10, lineHeight: 15 },

  weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, gap: 4, borderRadius: 10, borderCurve: 'continuous' },
  weekHead: { paddingVertical: 4, marginTop: 10 },
  weekToday: { backgroundColor: C.raised },
  weekH: { flex: 1, fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1.2 },
  weekDow: { flex: 1, fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 1 },
  weekPlan: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1 },
  weekExtra: { fontFamily: F.dot, fontSize: 7, color: C.live, letterSpacing: 1, marginTop: 2 },
  weekNum: { flex: 1, fontFamily: F.mono, fontSize: 10, color: C.ink },

  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  goalKey: { width: '48.5%', minHeight: TAP, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, borderCurve: 'continuous', padding: 12, gap: 3, backgroundColor: C.raised },
  goalKeyOn: { backgroundColor: C.hot, borderColor: C.hot },
  goalWord: { fontFamily: F.dot, fontSize: 14, color: C.hot, letterSpacing: 1.4 },
  goalLine: { fontFamily: F.mono, fontSize: 10, color: C.dim },
  paces: { flexDirection: 'row', gap: 8 },
  paceKey: { flex: 1, minHeight: TAP, borderWidth: 1, borderColor: C.lineHi, borderRadius: 14, borderCurve: 'continuous', padding: 10, gap: 3, backgroundColor: C.raised },
  preview: { marginTop: 14, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 14, borderCurve: 'continuous', padding: 12, gap: 5 },
  previewWord: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  previewHead: { fontFamily: F.dot, fontSize: 16, color: C.live },
  previewSub: { fontFamily: F.mono, fontSize: 11, color: C.ink, lineHeight: 15 },
  you: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, borderWidth: 1, borderColor: C.lineHi, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, backgroundColor: C.raised },
  fieldWord: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1.2 },
  fieldInput: { fontFamily: F.dot, fontSize: 17, color: C.hot, paddingVertical: 2 },
  sexKey: { flex: 1, height: TAP, borderWidth: 1, borderColor: C.lineHi, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised },
  setKey: { height: 50, borderRadius: 16, borderCurve: 'continuous', backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  setText: { fontFamily: F.dot, fontSize: 14, color: C.onHot, letterSpacing: 3 },
});
