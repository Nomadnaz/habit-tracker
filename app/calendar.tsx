import { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Task = { id: string; label: string; done: boolean; archived?: boolean };
type TaskMap = Record<string, Task[]>;

type MonthBlock = { year: number; month: number; key: string };

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MONTHS_BACK = 6;
const MONTHS_FORWARD = 18;

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
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monthBlocks = useMemo(() => buildMonthBlocks(today), [today]);
  const todayMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

  const [taskMap, setTaskMap] = useState<TaskMap>({});
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
  }

  function recordSectionOffset(key: string, y: number) {
    sectionOffsetsRef.current[key] = y;
    if (!didScrollToTodayRef.current && key === todayMonthKey) {
      requestAnimationFrame(scrollToTodayMonth);
    }
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

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#FF4D00" />
          <Text style={styles.backLabel}>TODAY</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <View style={[styles.corner, styles.cornerTL]} />
          <Text style={styles.title}>CALENDAR</Text>
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
      </View>

      <View style={styles.dowRow}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={styles.dowLabel}>{d}</Text>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {monthBlocks.map(({ year, month, key }, blockIndex) => {
          const cells = buildMonthCells(year, month);
          const showYear =
            blockIndex === 0 || monthBlocks[blockIndex - 1].year !== year;

          return (
            <View
              key={key}
              onLayout={e => recordSectionOffset(key, e.nativeEvent.layout.y)}
            >
              <Text style={[styles.monthHeading, blockIndex === 0 && styles.monthHeadingFirst]}>
                {MONTH_NAMES[month]}
                {showYear ? ` ${year}` : ''}
              </Text>

              <View style={styles.monthContainer}>
                <View style={styles.grid}>
                  {cells.map((day, idx) => {
                    if (day === null) {
                      return <View key={`blank-${key}-${idx}`} style={styles.cell} />;
                    }

                    const count = taskCountFor(year, month, day);
                    const done = doneCountFor(year, month, day);
                    const allDone = count > 0 && done === count;
                    const todayDay = isToday(year, month, day);

                    return (
                      <TouchableOpacity
                        key={`${key}-${day}`}
                        style={[styles.cell, todayDay && styles.cellToday]}
                        onPress={() =>
                          router.push({
                            pathname: '/day',
                            params: { date: dateKey(year, month, day) },
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dayNum, todayDay && styles.dayNumToday]}>
                          {String(day).padStart(2, '0')}
                        </Text>
                        {count > 0 && (
                          <View style={[styles.taskBadge, allDone && styles.taskBadgeDone]}>
                            <Text style={styles.taskBadgeText}>{count}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F2ED',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
    color: '#FF4D00',
    letterSpacing: 1,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'relative',
  },
  corner: {
    width: 10,
    height: 10,
    borderColor: '#FF4D00',
  },
  cornerTL: {
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  cornerBR: {
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  title: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 18,
    color: '#1A1714',
    letterSpacing: 2,
  },
  dowRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E1DA',
    paddingBottom: 8,
  },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 9,
    color: '#C7C1B8',
    letterSpacing: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  monthHeading: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 15,
    color: '#1A1714',
    letterSpacing: 2,
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  monthHeadingFirst: {
    marginTop: 4,
  },
  monthContainer: {
    backgroundColor: '#FCFBF9',
    borderWidth: 1,
    borderColor: '#E5E1DA',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  cellToday: {
    backgroundColor: '#FF4D00',
    borderRadius: 8,
  },
  dayNum: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    color: '#1A1714',
  },
  dayNumToday: {
    color: '#FCFBF9',
  },
  taskBadge: {
    marginTop: 3,
    backgroundColor: '#FF4D00',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  taskBadgeDone: {
    backgroundColor: '#4CAF50',
  },
  taskBadgeText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 9,
    color: '#FCFBF9',
  },
});
