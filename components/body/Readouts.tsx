// BODY's readouts — what each module (lib/body-hud.ts) shows, in two cuts:
// a compact one that hangs beside the figure on its line, and a row for the
// list under the figure (modules you haven't pinned to the body). Every
// number comes from the twin (lib/twin.ts, via TodayView), live heart rate
// from Apple Health (BodyData), mood from today's check-in.

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, MOD, numFace } from '@/lib/theme';
import { MODULES, type HudModule } from '@/lib/body-hud';
import { goalWord, hm, paceWord } from '@/lib/twin';
import { FOCUS_TITLE, LEVEL } from '@/lib/coach';
import type { TodayView } from '@/lib/twin-data';
import type { BodyData } from '@/lib/body-data';
import { todaySteps, todayWaterMl, latestWeight } from '@/lib/body-data';
import type { SheetKind } from '@/components/today/Sheets';
import { Segs } from '@/components/today/bits';
import { DotIcon } from '@/components/today/DotIcon';

export type ReadoutData = { view: TodayView | null; body: BodyData | null; mood: number | null };
export type ReadoutActs = {
  open: (s: SheetKind) => void;
  go: (path: string, params?: Record<string, string>) => void;
  water: () => void;
  weight: () => void;
  heart: () => void;
  recovery: () => void;
};

export type Readout = {
  id: HudModule;
  word: string;
  tone: string;
  value: string;
  unit: string;
  sub: string;
  /** Progress to the day's target, 0–1+ — drawn as a meter. */
  pct: number | null;
  /** The meter's colour, when it isn't the module's (over target → red). */
  meter?: string;
  /** Drawn under the number instead of a meter. */
  extra?: React.ReactNode;
  onPress: () => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const DASH = '—';
/** Taken within the last `hours` (pre-timestamp readings count as fresh). */
const fresh = (at: string | null | undefined, hours: number) => at === undefined || (!!at && Date.now() - Date.parse(at) < hours * 3_600_000);

export function readoutOf(id: HudModule, d: ReadoutData, act: ReadoutActs): Readout {
  const v = d.view, t = v?.twin, now = v?.now;
  const base = { id, word: MODULES[id].word, tone: MOD[id], unit: '', sub: '', pct: null as number | null };
  switch (id) {
    case 'steps': {
      const have = now?.steps ?? (d.body ? todaySteps(d.body) : 0);
      const want = t?.steps.value ?? d.body?.stepsGoal ?? 0;
      return { ...base, value: fmt(have), sub: want ? `OF ${fmt(want)}` : 'TODAY', pct: want ? have / want : null, onPress: () => (v ? act.open('steps') : act.go('/steps')) };
    }
    case 'water': {
      const have = now?.waterMl ?? (d.body ? todayWaterMl(d.body) : 0);
      const want = t?.water.value ?? d.body?.waterGoalMl ?? 0;
      return { ...base, value: fmt(have), unit: 'ML', sub: want ? `OF ${fmt(want)}` : 'TODAY', pct: want ? have / want : null, onPress: act.water };
    }
    case 'fuel': {
      if (!v || !t || !now) return { ...base, value: DASH, unit: 'KCAL', onPress: () => act.go('/calorie') };
      const pct = now.kcal / t.fuel.value;
      return { ...base, value: fmt(now.kcal), unit: 'KCAL', sub: `OF ${fmt(t.fuel.value)}`, pct, meter: pct > 1.05 ? C.alert : undefined, onPress: () => act.open('fuel') };
    }
    case 'sleep': {
      if (!t || !now) return { ...base, value: DASH, onPress: () => act.go('/modals/sleep-detail') };
      const need = t.sleep.lines[0].delta;
      const last = now.sleepMin;
      return { ...base, value: last == null ? DASH : hm(last), sub: `BED ${t.sleep.bed}`, pct: last == null ? null : last / need, onPress: () => act.open('sleep') };
    }
    case 'readiness': {
      if (!v) return { ...base, value: DASH, onPress: () => act.go('/settings/wearables') };
      const r = v.today.readiness;
      return { ...base, value: String(r.score), unit: LEVEL[r.level].word, sub: v.wearable ? 'HRV · SLEEP · HEART' : 'NO WATCH YET', pct: r.score / 100, meter: r.score >= 60 ? C.live : r.score >= 40 ? C.ink : C.alert, onPress: () => act.open('readiness') };
    }
    case 'train': {
      if (!v) return { ...base, value: DASH, onPress: () => act.go('/workouts') };
      const td = v.today;
      return {
        ...base, value: td.done ? 'DONE' : FOCUS_TITLE[td.focus], unit: '',
        sub: td.done ? `NEXT ${td.when}` : `${v.lifts} LIFTS · ${td.fresh}% FRESH`,
        onPress: () => act.go('/workouts', { focus: td.focus }),
      };
    }
    case 'muscles': {
      if (!t) return { ...base, value: DASH, onPress: act.recovery };
      const ready = t.groups.filter(g => g.pct >= 90).length;
      return {
        ...base, value: `${ready}/${t.groups.length}`, unit: 'READY', onPress: act.recovery,
        extra: (
          <View style={st.cells}>
            {t.groups.map(g => <View key={g.id} style={[st.cell, { backgroundColor: g.pct >= 90 ? C.live : g.pct >= 50 ? C.ink : C.alert }]} />)}
          </View>
        ),
      };
    }
    case 'week': {
      if (!t) return { ...base, value: DASH, onPress: () => act.go('/(tabs)/gym') };
      const sessions = t.week.filter(x => x.focus).length;
      return {
        ...base, value: String(sessions), unit: 'SESSIONS', onPress: () => act.open('week'),
        extra: (
          <View style={st.cells}>
            {t.week.map(x => (
              <View key={x.key} style={[st.day, x.focus && { backgroundColor: x.done ? C.live : C.lineHi }, x.today && st.dayToday]} />
            ))}
          </View>
        ),
      };
    }
    case 'goal': {
      if (!t) return { ...base, value: DASH, onPress: () => act.open('goal') };
      return { ...base, value: t.outlook.headline, sub: `${goalWord(t.goal.id)} · ${paceWord(t.goal.pace)}`, onPress: () => act.open('goal') };
    }
    case 'log': {
      const n = t?.log.length ?? 0;
      return { ...base, value: String(n), unit: 'SIGNALS', sub: 'TAP TO READ', onPress: () => act.go('/(tabs)/log', { tab: 'logs' }) };
    }
    case 'heart': {
      const h = d.body?.heart;
      const live = h?.bpm != null && fresh(h.bpmAt, 2) ? h.bpm : null;
      const bpm = live ?? (now?.rhr != null ? Math.round(now.rhr) : null);
      const hrv = h?.hrvMs ?? (now?.hrv != null ? Math.round(now.hrv) : null);
      return {
        ...base, value: bpm != null ? String(bpm) : DASH, unit: 'BPM',
        sub: bpm == null ? 'TAP TO CONNECT' : `${live != null ? 'NOW' : 'RESTING'}${hrv != null ? ` · HRV ${hrv}` : ''}`,
        extra: live != null ? <Beat bpm={live} /> : undefined,
        onPress: act.heart,
      };
    }
    case 'weight': {
      const kg = now?.weightKg ?? (d.body ? latestWeight(d.body) || null : null);
      const dl = now?.weightDelta;
      return { ...base, value: kg ? kg.toFixed(1) : DASH, unit: 'KG', sub: kg ? (dl != null ? `${dl > 0 ? '+' : ''}${dl} THIS WEEK` : 'LATEST') : 'TAP TO LOG', onPress: act.weight };
    }
    case 'active': {
      const kcal = now?.activeKcal;
      return { ...base, value: kcal != null ? fmt(kcal) : DASH, unit: 'KCAL', sub: kcal != null ? `${now?.activeMin ?? 0} MIN` : 'FROM APPLE HEALTH', onPress: () => act.go('/steps') };
    }
    case 'macros': {
      if (!t || !now) return { ...base, value: DASH, onPress: () => act.go('/calorie') };
      const rows: { k: string; have: number; want: number; tone: string; limit?: boolean }[] = [
        { k: 'P', have: now.proteinG, want: t.fuel.proteinG, tone: MOD.protein },
        { k: 'C', have: now.carbsG, want: t.fuel.carbsG, tone: MOD.carbs },
        { k: 'F', have: now.fatG, want: t.fuel.fatG, tone: MOD.fat },
        { k: 'S', have: now.sugarG ?? 0, want: now.sugarLimitG ?? 90, tone: MOD.sugar, limit: true },
      ];
      return {
        ...base, value: '', onPress: () => act.go('/calorie'),
        extra: (
          <View style={{ gap: 3, marginTop: 1 }}>
            {rows.map(r => {
              const p = r.want ? r.have / r.want : 0;
              const tone = r.limit && p > 1 ? C.alert : r.tone;
              return (
                <View key={r.k} style={st.macro}>
                  <Text style={[st.macroK, { color: tone }]}>{r.k}</Text>
                  <Segs pct={p} tone={tone} n={8} h={3} style={{ flex: 1 }} />
                  <Text style={st.macroV}>{`${fmt(r.have)}/${fmt(r.want)}`}</Text>
                </View>
              );
            })}
          </View>
        ),
      };
    }
    case 'mood':
      return { ...base, value: d.mood != null ? `${d.mood}/10` : DASH, sub: d.mood != null ? 'TODAY' : 'TAP TO LOG', onPress: () => act.go('/modals/mood') };
  }
}

/** The heart's square, beating at the measured rate. */
function Beat({ bpm }: { bpm: number }) {
  const o = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const ms = 60_000 / bpm;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: ms * 0.15, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.25, duration: ms * 0.85, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bpm]);
  return <Animated.View style={[st.beat, { opacity: o }]} />;
}

/** Beside the figure: glyph and word in the module's colour, the number, a line under it. */
export function ReadoutNode({ r, right }: { r: Readout; right: boolean }) {
  const long = r.value.length > 6; // a session name, a goal headline
  return (
    <View style={[st.node, right && { alignItems: 'flex-end' }]}>
      <View style={[st.head, right && { flexDirection: 'row-reverse' }]}>
        <DotIcon kind={r.id} tone={r.tone} dot={1.3} gap={0.3} />
        <Text style={[st.word, { color: r.tone }]} numberOfLines={1}>{r.word}</Text>
      </View>
      {!!r.value && (
        <View style={[st.valueRow, right && { flexDirection: 'row-reverse' }]}>
          <Text style={[st.value, numFace(r.value, long ? 13 : 21), right && { textAlign: 'right' }]} numberOfLines={long ? 2 : 1} adjustsFontSizeToFit={!long}>{r.value}</Text>
          {!!r.unit && <Text style={st.unit} numberOfLines={1}>{r.unit}</Text>}
        </View>
      )}
      {!!r.sub && <Text style={[st.sub, right && { textAlign: 'right' }]} numberOfLines={1}>{r.sub}</Text>}
      {r.extra ?? (r.pct != null && <Segs pct={r.pct} tone={r.meter ?? r.tone} n={10} h={3} style={st.meter} />)}
    </View>
  );
}

/** Under the figure: one ruled row per module that isn't on the body. */
export function ReadoutRow({ r, index }: { r: Readout; index: number }) {
  return (
    <Pressable onPress={r.onPress} style={({ pressed }) => [st.row, index === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.surface }]}>
      <DotIcon kind={r.id} tone={r.tone} dot={2} gap={0.5} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[st.rowWord, { color: r.tone }]}>{r.word}</Text>
        {!!r.sub && <Text style={st.rowSub} numberOfLines={1}>{r.sub}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4, maxWidth: '55%' }}>
        {!!r.value && (
          <View style={st.valueRow}>
            <Text style={[st.value, numFace(r.value, r.value.length > 8 ? 13 : 20)]} numberOfLines={1}>{r.value}</Text>
            {!!r.unit && <Text style={st.unit}>{r.unit}</Text>}
          </View>
        )}
        {r.extra ? <View style={{ width: 120 }}>{r.extra}</View> : r.pct != null && <Segs pct={r.pct} tone={r.meter ?? r.tone} n={12} h={3} style={{ width: 96 }} />}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  node: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  word: { fontFamily: F.dot, fontSize: 8, letterSpacing: 1.5, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { color: C.hot, flexShrink: 1 },
  unit: { fontFamily: F.dot, fontSize: 7, color: C.dim, letterSpacing: 1 },
  sub: { fontFamily: F.dot, fontSize: 7, color: C.faint, letterSpacing: 1 },
  meter: { width: 64, marginTop: 2 },
  cells: { flexDirection: 'row', gap: 2, marginTop: 2 },
  cell: { width: 5, height: 5 },
  day: { width: 6, height: 6, borderWidth: 1, borderColor: C.lineHi },
  dayToday: { borderColor: C.hot },
  beat: { width: 5, height: 5, backgroundColor: C.alert, marginTop: 2 },
  macro: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 96 },
  macroK: { fontFamily: F.dot, fontSize: 7, width: 6 },
  macroV: { fontFamily: F.dot, fontSize: 7, color: C.dim, minWidth: 38, textAlign: 'right' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.line },
  rowWord: { fontFamily: F.dot, fontSize: 11, letterSpacing: 2 },
  rowSub: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
});
