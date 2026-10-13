// A week of days across the top of TODAY: tap a day to see its tasks, swipe
// sideways for the next or previous week. While a task is being dragged the
// strip turns into two drop zones — DELETE on the left, EDIT on the right —
// and reports its window rect so the drag handler can hit-test the finger.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';

export type StripDate = { key: string; day: string; date: string; month: string };
export type ZoneRect = { top: number; bottom: number; midX: number };

const STRIP_H = 64;

/** Monday-first weekday index (0 = MON … 6 = SUN) for a 'YYYY-MM-DD' key. */
function weekdayOf(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function WeekStrip({ dates, selectedKey, todayKey, pending, onSelect, dragging, overDelete, overEdit, onZoneLayout }: {
  dates: StripDate[];
  selectedKey: string;
  todayKey: string;
  pending: (key: string) => number;
  onSelect: (key: string) => void;
  dragging: boolean;
  overDelete: boolean;
  overEdit: boolean;
  onZoneLayout: (rect: ZoneRect) => void;
}) {
  // Group the contiguous date list into Monday-first weeks, padding the ends.
  const weeks = useMemo(() => {
    const out: (StripDate | null)[][] = [];
    let week: (StripDate | null)[] = Array(weekdayOf(dates[0].key)).fill(null);
    for (const d of dates) {
      week.push(d);
      if (week.length === 7) { out.push(week); week = []; }
    }
    if (week.length) out.push([...week, ...Array(7 - week.length).fill(null)]);
    return out;
  }, [dates]);

  const weekOf = (key: string) => weeks.findIndex(w => w.some(d => d?.key === key));

  const [w, setW] = useState(0);
  const pageRef = useRef(Math.max(0, weekOf(selectedKey)));
  const scrollRef = useRef<ScrollView>(null);
  const wrapRef = useRef<View>(null);

  // Keep the visible week on the selected day when it changes from outside
  // (calendar jump, returning to the tab, a task moved to another day).
  useEffect(() => {
    const p = weekOf(selectedKey);
    if (p < 0 || !w || p === pageRef.current) return;
    pageRef.current = p;
    scrollRef.current?.scrollTo({ x: p * w, animated: true });
  }, [selectedKey, w]);

  // Park on the selected week without animating once the strip has a width
  // (contentOffset alone is iOS-only). Also re-parks after a drag ends.
  const park = () => scrollRef.current?.scrollTo({ x: pageRef.current * w, animated: false });

  const measure = () => {
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onZoneLayout({ top: y, bottom: y + height, midX: x + width / 2 });
    });
  };
  useEffect(() => { if (dragging) measure(); }, [dragging]);

  // Swiping to another week keeps the same weekday selected, so the task list
  // always matches a day you can see.
  const onPageSettled = (x: number) => {
    if (!w) return;
    const p = Math.round(x / w);
    if (p === pageRef.current) return;
    pageRef.current = p;
    const col = weekdayOf(selectedKey);
    const week = weeks[p];
    const pick = week[col] ?? week.find(Boolean);
    if (pick) { onSelect(pick.key); Haptics.selectionAsync(); }
  };

  return (
    <View
      ref={wrapRef}
      style={styles.wrap}
      onLayout={e => { setW(e.nativeEvent.layout.width); measure(); }}
    >
      {dragging ? (
        <View style={styles.zones}>
          <Zone icon="trash-can-outline" label={overDelete ? 'RELEASE' : 'DELETE'} on={overDelete} danger />
          <Zone icon="pencil-outline" label={overEdit ? 'RELEASE' : 'EDIT'} on={overEdit} />
        </View>
      ) : w > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: pageRef.current * w, y: 0 }}
          onContentSizeChange={park}
          onMomentumScrollEnd={e => onPageSettled(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          {weeks.map((week, wi) => (
            <View key={wi} style={[styles.week, { width: w }]}>
              {week.map((d, i) => d ? (
                <Day key={d.key} d={d} on={d.key === selectedKey} today={d.key === todayKey}
                  count={pending(d.key)} onPress={() => { if (d.key !== selectedKey) { onSelect(d.key); Haptics.selectionAsync(); } }} />
              ) : <View key={`pad${i}`} style={styles.day} />)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Day({ d, on, today, count, onPress }: { d: StripDate; on: boolean; today: boolean; count: number; onPress: () => void }) {
  const fg = on ? C.onHot : C.ink;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.day, on && styles.dayOn, pressed && !on && { backgroundColor: C.raised }]}>
      <Text style={[styles.dow, { color: today && !on ? C.live : on ? C.onHot : C.dim }]}>{d.day.slice(0, 3)}</Text>
      <Text style={[styles.num, { color: fg }]}>{d.date}</Text>
      <View style={styles.marks}>
        {count > 0 && <View style={[styles.mark, { backgroundColor: on ? C.onHot : C.dim }]} />}
        {today && <View style={[styles.mark, { backgroundColor: C.live }]} />}
      </View>
    </Pressable>
  );
}

function Zone({ icon, label, on, danger }: { icon: 'trash-can-outline' | 'pencil-outline'; label: string; on: boolean; danger?: boolean }) {
  const bg = on ? (danger ? C.alert : C.hot) : C.raised;
  const fg = on ? (danger ? C.hot : C.onHot) : C.ink;
  return (
    <View style={[styles.zone, { backgroundColor: bg, borderColor: on ? bg : C.lineHi }]}>
      <MaterialCommunityIcons name={icon} size={20} color={fg} />
      <Text style={[styles.zoneLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: STRIP_H, marginHorizontal: 16, marginBottom: 10 },
  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, height: STRIP_H, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayOn: { backgroundColor: C.hot },
  dow: { fontFamily: F.dot, fontSize: 9, letterSpacing: 1.5 },
  num: { fontFamily: F.dot, fontSize: 20 },
  marks: { flexDirection: 'row', gap: 3, height: 4 },
  mark: { width: 4, height: 4, borderRadius: 2 },
  zones: { flex: 1, flexDirection: 'row', gap: 8 },
  zone: { flex: 1, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  zoneLabel: { fontFamily: F.dot, fontSize: 12, letterSpacing: 2 },
});
