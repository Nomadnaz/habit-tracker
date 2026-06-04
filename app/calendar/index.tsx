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
  const cellHeight = Math.max(56, Math.floor(cellWidth * 1.05));

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

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          activeOpacity={0.7}
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

      <View style={styles.yearBar}>
        <Text style={styles.yearText}>{visibleYear}</Text>
      </View>

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
                      {count > 0 && (
                        <View
                          style={[
                            styles.taskBadge,
                            allDone && styles.taskBadgeDone,
                            todayDay && styles.taskBadgeToday,
                          ]}
                        >
                          <Text
                            style={[
                              styles.taskBadgeText,
                              todayDay && styles.taskBadgeTextToday,
                            ]}
                          >
                            {count}
                          </Text>
                        </View>
                      )}
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
  container: {
    flex: 1,
    backgroundColor: '#F5F2ED',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
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
  yearBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E1DA',
  },
  yearText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 36,
    color: '#FF4D00',
    letterSpacing: 2,
  },
  dowRow: {
    flexDirection: 'row',
    paddingHorizontal: SCROLL_HORIZONTAL_PAD,
    marginBottom: 8,
    paddingTop: 10,
    paddingBottom: 8,
  },
  dowLabel: {
    textAlign: 'center',
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 9,
    color: '#C7C1B8',
    letterSpacing: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SCROLL_HORIZONTAL_PAD,
    paddingBottom: 40,
  },
  monthHeading: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 24,
    color: '#1A1714',
    letterSpacing: 2,
    marginTop: 28,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  monthHeadingFirst: {
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'visible',
  },
  cellToday: {
    backgroundColor: '#FF4D00',
  },
  dayNum: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 22,
    color: '#1A1714',
    letterSpacing: 1,
    lineHeight: 22,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  dayNumToday: {
    color: '#FCFBF9',
  },
  taskBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: '#FF4D00',
    borderRadius: 8,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    zIndex: 1,
  },
  taskBadgeDone: {
    backgroundColor: '#4CAF50',
  },
  taskBadgeToday: {
    backgroundColor: '#FCFBF9',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 0, 0.35)',
  },
  taskBadgeText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 7,
    color: '#FCFBF9',
    lineHeight: 9,
    includeFontPadding: false,
  },
  taskBadgeTextToday: {
    color: '#FF4D00',
  },
});
