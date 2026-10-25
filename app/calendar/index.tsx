import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDateKey } from '@/lib/dateKey';

import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
type Task = { id: string; label: string; done: boolean; archived?: boolean };
type TaskMap = Record<string, Task[]>;

type MonthBlock = { year: number; month: number; key: string };

// month here is 0-indexed (matches Date#getMonth()) — converted to the
// canonical zero-padded, 1-indexed key format from lib/dateKey.ts.
function dateKey(year: number, month: number, day: number): string {
  return toDateKey(new Date(year, month, day));
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MONTHS_BACK = 3;
const MONTHS_FORWARD = 12;
const SCROLL_HORIZONTAL_PAD = 16;
const YEAR_STICKY_OFFSET = 72;

function buildMonthBlocks(anchor: Date): MonthBlock[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth() - MONTHS_BACK, 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + MONTHS_FORWARD, 1);
  const blocks: MonthBlock[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    blocks.push({ year, month, key: `${year}-${month}` });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return blocks;
}

function buildMonthCells(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cellWidth = Math.floor((screenWidth - SCROLL_HORIZONTAL_PAD * 2) / 7);
  const cellHeight = Math.max(46, Math.floor(cellWidth * 0.9));

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monthBlocks = useMemo(() => buildMonthBlocks(today), [today]);
  const todayMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

  const [taskMap, setTaskMap] = useState<TaskMap>({});
  const [visibleYear, setVisibleYear] = useState(today.getFullYear());
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const didScrollToTodayRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      didScrollToTodayRef.current = false;
      AsyncStorage.getItem('@tasks').then(raw => {
        if (raw) setTaskMap(JSON.parse(raw) as TaskMap);
      });
    }, []),
  );

  function scrollToTodayMonth() {
    const y = sectionOffsetsRef.current[todayMonthKey];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
    didScrollToTodayRef.current = true;
    setVisibleYear(today.getFullYear());
  }

  function recordSectionOffset(key: string, y: number) {
    sectionOffsetsRef.current[key] = y;
    if (!didScrollToTodayRef.current && key === todayMonthKey) {
      requestAnimationFrame(scrollToTodayMonth);
    }
  }

  const updateVisibleYear = useCallback(
    (scrollY: number) => {
      let year = monthBlocks[0]?.year ?? today.getFullYear();
      for (const block of monthBlocks) {
        const offset = sectionOffsetsRef.current[block.key];
        if (offset != null && offset <= scrollY + YEAR_STICKY_OFFSET) {
          year = block.year;
        }
      }
      setVisibleYear(prev => (prev === year ? prev : year));
    },
    [monthBlocks, today],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateVisibleYear(e.nativeEvent.contentOffset.y);
    },
    [updateVisibleYear],
  );

  function openDay(year: number, month: number, day: number) {
    const key = dateKey(year, month, day);
    router.push({
      pathname: '/calendar/day',
      params: { date: key },
    });
  }

  const taskCountFor = (year: number, month: number, day: number): number => {
    const key = dateKey(year, month, day);
    return (taskMap[key] ?? []).filter(t => !t.archived).length;
  };

  const doneCountFor = (year: number, month: number, day: number): number => {
    const key = dateKey(year, month, day);
    return (taskMap[key] ?? []).filter(t => t.done && !t.archived).length;
  };

  const isToday = (year: number, month: number, day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* The year in the title follows the scroll. */}
      <ScreenHeader title={`CALENDAR ${visibleYear}`} close />

      <View style={styles.dowRow}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={[styles.dowLabel, { width: cellWidth }]}>{d}</Text>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="always"
      >
        {monthBlocks.map(({ year, month, key }, blockIndex) => {
          const cells = buildMonthCells(year, month);

          return (
            <View
              key={key}
              onLayout={e => recordSectionOffset(key, e.nativeEvent.layout.y)}
            >
              <Text style={[styles.monthHeading, blockIndex === 0 && styles.monthHeadingFirst]}>
                {MONTH_NAMES[month]}
              </Text>

              <View style={styles.grid}>
                {cells.map((day, idx) => {
                  if (day === null) {
                    return (
                      <View
                        key={`blank-${key}-${idx}`}
                        style={{ width: cellWidth, height: cellHeight }}
                      />
                    );
                  }

                  const count = taskCountFor(year, month, day);
                  const done = doneCountFor(year, month, day);
                  const allDone = count > 0 && done === count;
                  const todayDay = isToday(year, month, day);

                  return (
                    <TouchableOpacity
                      key={`${key}-${day}`}
                      style={[
                        styles.cell,
                        { width: cellWidth, height: cellHeight },
                        todayDay && styles.cellToday,
                      ]}
                      onPress={() => openDay(year, month, day)}
                      activeOpacity={0.65}
                      delayPressIn={0}
                    >
                      <Text style={[styles.dayNum, todayDay && styles.dayNumToday]}>
                        {day}
                      </Text>
                      {/* A dot under the number: grey = tasks planned, green = all done. */}
                      <View style={[
                        styles.taskDot,
                        count > 0 && { backgroundColor: allDone ? C.live : todayDay ? C.onHot : C.dim },
                      ]} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  dowRow: { flexDirection: 'row', paddingHorizontal: SCROLL_HORIZONTAL_PAD, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  dowLabel: { textAlign: 'center', fontFamily: F.dot, fontSize: 9, color: C.faint, letterSpacing: 1 },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SCROLL_HORIZONTAL_PAD,
    paddingBottom: 40,
  },
  monthHeading: { fontFamily: F.dot, fontSize: 16, color: C.ink, letterSpacing: 2, marginTop: 22, marginBottom: 8, paddingHorizontal: 4 },
  monthHeadingFirst: { marginTop: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderCurve: 'continuous', gap: 5 },
  cellToday: {
    backgroundColor: C.hot,
  },
  dayNum: { fontFamily: F.dot, fontSize: 17, color: C.ink, letterSpacing: 1, textAlign: 'center' },
  dayNumToday: {
    color: C.onHot,
  },
  taskDot: { width: 4, height: 4, borderRadius: 2 },
});
