// TODAY's deck — modules in a two-column grid, each a key on the board.
// Tap one for its detail; hold one (or the deck key in the header) to edit:
// modules shrink into their slots, × ejects one to the bay, tapping two
// swaps them. Every number comes from the twin (lib/twin.ts) via TodayView.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, MOD, SPRING, numFace } from '@/lib/theme';
import { MODULES, packRows, type ModuleId } from '@/lib/today-deck';
import { goalWord, hm, paceWord } from '@/lib/twin';
import { FOCUS_TITLE, LEVEL } from '@/lib/coach';
import type { TodayView } from '@/lib/twin-data';
import { TypeLine } from '@/components/TypeLine';
import { Count, Pixel, Segs } from './bits';
import { DotIcon, type DotIconKind } from './DotIcon';

export type SheetKind = 'steps' | 'water' | 'fuel' | 'sleep' | 'readiness' | 'week' | 'goal';
export type DeckActions = {
  open: (s: SheetKind) => void;
  go: (path: string, params?: Record<string, string>) => void;
  addWater: (ml: number) => void;
};

const GAP = 8;
const HALF_H = 138;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const LEVEL_TONE = { push: C.live, train: C.live, easy: C.hot, recover: C.alert } as const;
const GLYPH: Partial<Record<ModuleId, DotIconKind>> = { steps: 'foot', water: 'drop', fuel: 'can', sleep: 'moon', heart: 'heart', active: 'bolt' };

export function Deck({ deck, view, width, editing, selected, onSelect, onEject, onHold, act }: {
  deck: ModuleId[];
  view: TodayView;
  width: number;
  editing: boolean;
  selected: ModuleId | null;
  onSelect: (id: ModuleId) => void;
  onEject: (id: ModuleId) => void;
  onHold: (id: ModuleId) => void;
  act: DeckActions;
}) {
  // One wrapping container (not a View per row) so a module keeps its identity
  // when it moves rows, and the re-slot animation can slide it there.
  const half = Math.floor((width - GAP) / 2);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: width - half * 2, rowGap: GAP }}>
      {packRows(deck).flat().map((id, index) => {
        const m = moduleOf(id, view, act);
        return (
          <Frame
            key={id} index={index} word={MODULES[id].word} tone={MOD[id]} glyph={GLYPH[id]} led={m.led} tag={m.tag}
            width={MODULES[id].wide ? width : half} height={MODULES[id].wide ? undefined : HALF_H}
            editing={editing} selected={selected === id}
            onPress={() => (editing ? onSelect(id) : m.onPress?.())}
            onLongPress={() => onHold(id)}
            onEject={() => onEject(id)}
          >
            {m.body}
          </Frame>
        );
      })}
    </View>
  );
}

// ── the key every module sits in ─────────────────────────────────────────

function Frame({ index, word, tone, glyph, led, tag, width, height, editing, selected, onPress, onLongPress, onEject, children }: {
  index: number; word: string; tone: string; glyph?: DotIconKind; led?: { tone: string; blink?: boolean }; tag?: string;
  width: number; height?: number; editing: boolean; selected: boolean;
  onPress: () => void; onLongPress: () => void; onEject: () => void; children: React.ReactNode;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const edit = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(appear, { toValue: 1, delay: Math.min(index, 9) * 55, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    Animated.spring(edit, { toValue: editing && !selected ? 0.955 : 1, ...SPRING.pop }).start();
  }, [editing, selected]);
  const scale = Animated.multiply(Animated.multiply(appear.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }), press), edit);

  return (
    <Animated.View style={{ width, height, opacity: appear, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={380}
        onPressIn={() => Animated.spring(press, { toValue: 0.965, ...SPRING.pop }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, ...SPRING.pop }).start()}
        style={[st.frame, { borderColor: `${tone}33` }, height != null && { flex: 1 }, editing && st.frameEdit, selected && st.frameSel]}
      >
        <View style={st.head}>
          <View style={[st.chip, { backgroundColor: `${tone}1F` }]}>
            {glyph && <DotIcon kind={glyph} tone={tone} />}
            <Text style={[st.word, { color: tone }]} numberOfLines={1}>{word}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {!!tag && !editing && <Text style={st.tag} numberOfLines={1}>{tag}</Text>}
          {led && !editing && <Pixel tone={led.tone} blink={led.blink} />}
        </View>
        <View pointerEvents={editing ? 'none' : 'auto'} style={[{ flex: 1 }, editing && { opacity: 0.55 }]}>{children}</View>
      </Pressable>
      {editing && (
        <Pressable onPress={onEject} hitSlop={10} style={st.eject} accessibilityLabel={`Remove ${word}`}>
          <MaterialCommunityIcons name="close" size={12} color={C.ink} />
        </Pressable>
      )}
    </Animated.View>
  );
}

// ── what each module shows ───────────────────────────────────────────────

type Mod = { body: React.ReactNode; led?: { tone: string; blink?: boolean }; tag?: string; onPress?: () => void };

const ledFor = (pct: number, started: boolean) => ({ tone: pct >= 1 ? C.live : started ? C.hot : C.ghost });
/** What the twin changed today, net of everything after the base — the module's tag. */
const delta = (lines: { delta: number }[], unit = '') => {
  const d = lines.slice(1).reduce((a, l) => a + l.delta, 0);
  return lines.length > 1 && d !== 0 ? `${d > 0 ? '+' : '-'}${fmt(Math.abs(d))}${unit}` : undefined;
};

function moduleOf(id: ModuleId, v: TodayView, act: DeckActions): Mod {
  const t = v.twin;
  switch (id) {
    case 'steps': {
      const pct = v.now.steps / t.steps.value;
      return {
        led: ledFor(pct, v.now.steps > 0), tag: delta(t.steps.lines), onPress: () => act.open('steps'),
        body: <Half big={<Count value={v.now.steps} style={st.big} />} sub={`of ${fmt(t.steps.value)}`} pct={pct} tone={MOD.steps} />,
      };
    }
    case 'water': {
      const pct = v.now.waterMl / t.water.value;
      return {
        led: ledFor(pct, v.now.waterMl > 0), tag: delta(t.water.lines, ' ML'), onPress: () => act.open('water'),
        body: (
          <Half
            big={<Count value={v.now.waterMl} style={st.big} />}
            sub={`of ${fmt(t.water.value)} ml`} pct={pct} tone={MOD.water}
            side={<Pressable onPress={() => act.addWater(250)} hitSlop={8} style={({ pressed }) => [st.miniKey, pressed && st.miniKeyOn]}><Text style={st.miniKeyText}>+250</Text></Pressable>}
          />
        ),
      };
    }
    case 'fuel': {
      const pct = v.now.kcal / t.fuel.value;
      return {
        led: { tone: pct > 1.05 ? C.alert : pct >= 0.9 ? C.live : v.now.kcal > 0 ? C.hot : C.ghost }, tag: delta(t.fuel.lines), onPress: () => act.open('fuel'),
        body: <Half top={`${Math.round(v.now.proteinG)}/${t.fuel.proteinG} g protein`} big={<Count value={v.now.kcal} style={st.big} />} sub={`of ${fmt(t.fuel.value)} kcal`} pct={pct} tone={pct > 1.05 ? C.alert : MOD.fuel} />,
      };
    }
    case 'sleep': {
      const need = t.sleep.lines[0].delta;
      const last = v.now.sleepMin;
      return {
        led: { tone: last == null ? C.ghost : last >= need ? C.live : C.hot }, tag: delta(t.sleep.lines, ' MIN'), onPress: () => act.open('sleep'),
        body: <Half top={`last night ${last == null ? '--' : hm(last).toLowerCase()}`} big={<Text style={st.big}>{t.sleep.bed}</Text>} sub={`bed · ${hm(t.sleep.value).toLowerCase()} asleep`} pct={last == null ? 0 : last / need} tone={MOD.sleep} />,
      };
    }
    case 'readiness': {
      const r = v.today.readiness;
      return {
        led: { tone: LEVEL_TONE[r.level] }, tag: LEVEL[r.level].word, onPress: () => act.open('readiness'),
        body: (
          <View style={st.readiness}>
            <View style={{ width: 104 }}>
              <Count value={r.score} style={[st.score, { color: MOD.readiness }]} />
              <Text style={st.dose} numberOfLines={2}>{LEVEL[r.level].dose}</Text>
            </View>
            <View style={{ flex: 1, gap: 7, justifyContent: 'center' }}>
              {r.factors.map(f => (
                <View key={f.id} style={st.factor}>
                  <Text style={st.factorLabel}>{f.label.replace('RESTING HR', 'RHR').replace('MUSCLE LOAD', 'LOAD')}</Text>
                  <Segs pct={f.score / 100} tone={f.score >= 60 ? C.live : f.score >= 40 ? C.ink : C.alert} n={10} h={4} style={{ flex: 1 }} />
                  <Text style={st.factorVal}>{f.value}</Text>
                </View>
              ))}
              {!v.wearable && (
                <Pressable onPress={() => act.go('/settings/wearables')} hitSlop={6}>
                  <Text style={st.link}>Connect a watch for HRV + sleep ›</Text>
                </Pressable>
              )}
            </View>
          </View>
        ),
      };
    }
    case 'train': {
      const d = v.today;
      const extra = t.week[0].extra;
      const live = d.scheduled && !d.done;
      const lineup = `${v.lifts} lifts · ${d.fresh}% fresh${v.resting ? ` · ${v.resting} resting` : ''}`;
      return {
        led: { tone: d.done ? C.live : live ? C.live : C.ghost, blink: live }, tag: d.done ? 'DONE' : d.when,
        onPress: () => act.go('/workouts', { focus: d.focus }),
        body: (
          <View style={st.session}>
            <View style={{ flex: 1 }}>
              <Text style={st.sessionTitle} numberOfLines={1}>{d.done ? 'SESSION DONE' : FOCUS_TITLE[d.focus]}</Text>
              <Text style={st.sessionSub} numberOfLines={1}>{d.done ? `Next: ${FOCUS_TITLE[d.focus].toLowerCase()} · ${d.when.toLowerCase()}` : lineup}</Text>
              {!!extra && <Text style={st.sessionExtra}>{d.scheduled ? `+ ${extra}` : `TODAY  ${extra}`}</Text>}
            </View>
            {!d.done && (
              <View style={[st.key, !live && st.keyGhost]}>
                <Text style={[st.keyText, !live && { color: C.ink }]}>{live ? 'START' : 'PLAN'}</Text>
              </View>
            )}
          </View>
        ),
      };
    }
    case 'muscles': {
      const ready = t.groups.filter(g => g.pct >= 90).length;
      return {
        tag: `${ready} OF ${t.groups.length} READY`, onPress: () => act.go('/(tabs)/body'),
        body: (
          <View style={st.muscles}>
            {t.groups.map(g => (
              <View key={g.id} style={st.muscle}>
                <View style={st.muscleHead}>
                  <Text style={st.muscleWord}>{g.word}</Text>
                  <Text style={[st.musclePct, g.pct >= 90 && { color: C.live }]}>{g.pct}</Text>
                </View>
                <Segs pct={g.pct / 100} tone={g.pct >= 90 ? C.live : g.pct >= 50 ? C.ink : C.alert} n={8} h={3} />
              </View>
            ))}
          </View>
        ),
      };
    }
    case 'week': {
      const max = Math.max(...t.week.map(d => d.kcal));
      const min = Math.min(...t.week.map(d => d.kcal));
      return {
        tag: `${t.week.filter(d => d.focus).length} SESSIONS`, onPress: () => act.open('week'),
        body: (
          <View>
            <View style={st.week}>
              {t.week.map(d => (
                <View key={d.key} style={[st.day, d.today && st.dayToday]}>
                  <Text style={[st.dayDow, d.today && { color: C.hot }]}>{d.today ? 'NOW' : d.dow}</Text>
                  <Text style={[st.dayFocus, !d.focus && { color: C.faint }]} numberOfLines={1}>{d.word}</Text>
                  <View style={st.dayBarTrack}>
                    <View style={[st.dayBar, { height: 6 + 22 * (max > min ? (d.kcal - min) / (max - min) : 0.5), backgroundColor: d.today ? C.hot : C.lineHi }]} />
                  </View>
                  <Text style={st.dayNum}>{fmt(d.kcal)}</Text>
                  <Text style={st.dayNum}>{Math.round(d.steps / 100) / 10}k</Text>
                  <Text style={st.dayNum}>{hm(d.sleepMin).toLowerCase()}</Text>
                  {d.done && <View style={st.dayDone}><Pixel tone={C.live} size={4} /></View>}
                </View>
              ))}
            </View>
            <Text style={st.legend}>kcal · steps · sleep, set per day</Text>
          </View>
        ),
      };
    }
    case 'goal': {
      return {
        tag: paceWord(t.goal.pace), onPress: () => act.open('goal'),
        body: (
          <View style={st.goal}>
            <View style={st.goalRow}>
              <Text style={st.goalWord}>{goalWord(t.goal.id)}</Text>
              <Text style={[st.goalHead, numFace(t.outlook.headline, 18), { color: MOD.goal }]}>{t.outlook.headline}</Text>
            </View>
            <Text style={st.goalSub} numberOfLines={2}>{t.outlook.sub}</Text>
          </View>
        ),
      };
    }
    case 'log':
      return { tag: `${t.log.length} SIGNALS`, body: <TwinLog lines={t.log} at={v.at} /> };
    case 'heart': {
      const has = v.now.rhr != null || v.now.hrv != null;
      return {
        led: { tone: has ? C.live : C.ghost, blink: has }, onPress: () => act.go(v.wearable ? '/(tabs)/body' : '/settings/wearables'),
        body: <Half big={<Text style={[st.big, { color: MOD.heart }]}>{v.now.rhr != null ? Math.round(v.now.rhr) : '--'}</Text>} sub={has ? `bpm resting · hrv ${v.now.hrv != null ? Math.round(v.now.hrv) : '--'} ms` : 'connect a watch'} />,
      };
    }
    case 'weight': {
      const kg = v.now.weightKg;
      const dl = v.now.weightDelta;
      return {
        onPress: () => act.go('/(tabs)/body'),
        body: <Half big={<Text style={[st.big, numFace(kg ? kg.toFixed(1) : '--', 30), { color: MOD.weight }]}>{kg ? kg.toFixed(1) : '--'}</Text>} sub={kg ? `kg${dl != null ? ` · ${dl > 0 ? '+' : ''}${dl} this week` : ''}` : 'log a weigh-in'} />,
      };
    }
    case 'active': {
      return {
        onPress: () => act.go('/steps'),
        body: <Half big={<Count value={v.now.activeKcal ?? 0} style={[st.big, { color: MOD.active }]} />} sub={v.now.activeKcal != null ? `kcal active · ${v.now.activeMin ?? 0} min` : 'from apple health'} />,
      };
    }
    case 'macros': {
      const sugarLimit = v.now.sugarLimitG ?? 90;
      const cols: { word: string; have: number; want: number; tone: string; limit?: boolean }[] = [
        { word: 'PROTEIN', have: v.now.proteinG, want: t.fuel.proteinG, tone: MOD.protein },
        { word: 'CARBS', have: v.now.carbsG, want: t.fuel.carbsG, tone: MOD.carbs },
        { word: 'FAT', have: v.now.fatG, want: t.fuel.fatG, tone: MOD.fat },
        { word: 'SUGAR', have: v.now.sugarG ?? 0, want: sugarLimit, tone: MOD.sugar, limit: true },
      ];
      const proteinHit = v.now.proteinG >= t.fuel.proteinG;
      return {
        led: { tone: proteinHit ? C.live : v.now.kcal > 0 ? MOD.protein : C.ghost },
        tag: proteinHit ? 'PROTEIN HIT' : undefined,
        onPress: () => act.go('/calorie'),
        body: (
          <View style={st.macros}>
            {cols.map(m => {
              const pct = m.want ? m.have / m.want : 0;
              const tone = m.limit && pct > 1 ? C.alert : m.tone;
              return (
                <View key={m.word} style={st.macro}>
                  <Text style={st.macroWord}>{m.limit ? 'SUGAR·MAX' : m.word}</Text>
                  <Text style={[st.macroVal, { color: tone }]} numberOfLines={1}>
                    {fmt(m.have)}<Text style={st.macroOf}>{`/${fmt(m.want)}G`}</Text>
                  </Text>
                  <Battery pct={pct} tone={tone} />
                </View>
              );
            })}
          </View>
        ),
      };
    }
  }
}

/** The workout screen's battery, small: a bordered row of cells and a nub. The
 *  next cell to light blinks, like it's charging; past the goal the end cell
 *  blinks red for a limit. */
function Battery({ pct, tone, n = 8 }: { pct: number; tone: string; n?: number }) {
  const lit = Math.max(0, Math.min(n, Math.round(pct * n)));
  const charging = lit < n ? lit : tone === C.alert ? n - 1 : -1;
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (charging < 0) { o.setValue(1); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.15, duration: 600, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [charging]);
  return (
    <View style={st.batteryRow}>
      <View style={st.battery}>
        {Array.from({ length: n }, (_, i) => i === charging
          ? <Animated.View key={i} style={[st.cell, { backgroundColor: tone, opacity: o }]} />
          : <View key={i} style={[st.cell, { backgroundColor: i < lit ? tone : C.ghost }]} />)}
      </View>
      <View style={st.nub} />
    </View>
  );
}

/** The half-width layout: big number, a line under it, a meter along the bottom. */
function Half({ top, big, sub, pct, tone, side }: { top?: string; big: React.ReactNode; sub: string; pct?: number; tone?: string; side?: React.ReactNode }) {
  return (
    <View style={st.half}>
      {!!top && <Text style={st.top} numberOfLines={1}>{top}</Text>}
      {big}
      <View style={st.halfSubRow}>
        <Text style={st.sub} numberOfLines={1}>{sub}</Text>
        {side}
      </View>
      {pct != null && tone && <Segs pct={pct} tone={tone} style={{ marginTop: 9 }} />}
    </View>
  );
}

/** What the twin weighed today, typed out terminal-style; tap to see it all. */
function TwinLog({ lines, at }: { lines: TodayView['twin']['log']; at: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? lines : lines.slice(0, 5);
  return (
    <Pressable onPress={() => setOpen(o => !o)} style={{ gap: 6 }}>
      {shown.map((l, i) => (
        <View key={`${at}-${i}`} style={st.logRow}>
          <Text style={st.logTag}>{l.tag}</Text>
          <View style={{ flex: 1 }}>
            <TypeLine text={l.text} style={st.logText} numberOfLines={2} speed={9} delay={250 + i * 160} />
          </View>
        </View>
      ))}
      {lines.length > 5 && <Text style={st.legend}>{open ? 'show less' : `+${lines.length - 5} more`}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  frame: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 13, gap: 10 },
  frameEdit: { borderStyle: 'dashed', borderColor: C.lineHi, backgroundColor: C.bg },
  frameSel: { borderStyle: 'solid', borderColor: C.hot },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  word: { fontFamily: F.dot, fontSize: 9, letterSpacing: 2.2 },
  tag: { flexShrink: 0, fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.6, borderWidth: 1, borderColor: C.line, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  eject: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },

  half: { flex: 1, justifyContent: 'flex-end' },

  macros: { flexDirection: 'row', gap: 12, paddingTop: 2 },
  macro: { flex: 1, gap: 4 },
  macroWord: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.2 },
  macroVal: { fontFamily: F.dot, fontSize: 24, color: C.hot },
  macroOf: { fontFamily: F.dot, fontSize: 10, color: C.faint },
  batteryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  battery: { flex: 1, flexDirection: 'row', gap: 2, padding: 2, borderWidth: 1, borderColor: C.lineHi, borderRadius: 4 },
  cell: { flex: 1, height: 10, borderRadius: 1 },
  nub: { width: 2, height: 6, backgroundColor: C.lineHi, marginLeft: 1, borderTopRightRadius: 1, borderBottomRightRadius: 1 },
  top: { fontFamily: F.mono, fontSize: 10, color: C.faint, marginBottom: 2 },
  big: { fontFamily: F.dot, fontSize: 30, color: C.hot, letterSpacing: 0.5 },
  halfSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sub: { flex: 1, fontFamily: F.mono, fontSize: 11, color: C.dim },
  miniKey: { borderWidth: 1, borderColor: C.lineHi, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  miniKeyOn: { backgroundColor: C.water, borderColor: C.water },
  miniKeyText: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1 },

  readiness: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  score: { fontFamily: F.dot, fontSize: 50, color: C.hot, lineHeight: 54 },
  dose: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 2 },
  factor: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factorLabel: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.5, width: 36 },
  factorVal: { fontFamily: F.dot, fontSize: 9, color: C.ink, width: 36, textAlign: 'right' },
  link: { fontFamily: F.mono, fontSize: 10, color: C.ink, marginTop: 2 },

  session: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionTitle: { fontFamily: F.dot, fontSize: 22, color: C.hot, letterSpacing: 1 },
  sessionSub: { fontFamily: F.mono, fontSize: 11, color: C.dim, marginTop: 3 },
  sessionExtra: { fontFamily: F.dot, fontSize: 9, color: C.live, letterSpacing: 1.5, marginTop: 6 },
  key: { height: 38, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' },
  keyGhost: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineHi },
  keyText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },

  muscles: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12 },
  muscle: { width: '30%', flexGrow: 1, gap: 4 },
  muscleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  muscleWord: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1.4 },
  musclePct: { fontFamily: F.dot, fontSize: 11, color: C.ink },

  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  dayToday: { borderColor: C.lineHi, backgroundColor: C.raised },
  dayDow: { fontFamily: F.dot, fontSize: 8, color: C.dim, letterSpacing: 1 },
  dayFocus: { fontFamily: F.dot, fontSize: 8, color: C.ink, letterSpacing: 0.6 },
  dayBarTrack: { height: 28, justifyContent: 'flex-end' },
  dayBar: { width: 8, borderRadius: 2 },
  dayNum: { fontFamily: F.mono, fontSize: 9, color: C.dim },
  dayDone: { position: 'absolute', top: 4, right: 4 },
  legend: { fontFamily: F.mono, fontSize: 10, color: C.faint, marginTop: 8 },

  goal: { gap: 6 },
  goalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  goalWord: { fontFamily: F.dot, fontSize: 22, color: C.hot, letterSpacing: 1 },
  goalHead: { fontFamily: F.dot, fontSize: 18, color: C.live, letterSpacing: 1 },
  goalSub: { fontFamily: F.mono, fontSize: 11, color: C.dim },

  logRow: { flexDirection: 'row', gap: 10 },
  logTag: { fontFamily: F.dot, fontSize: 8, color: C.faint, letterSpacing: 1.4, width: 40, paddingTop: 2 },
  logText: { fontFamily: F.mono, fontSize: 11, color: C.ink, lineHeight: 15 },
});
