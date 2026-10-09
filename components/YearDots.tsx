// The year in dots — the puck's lög home, laid out for a phone: one row per
// month, one column per day, read like a departure board. White = a day you
// did something, ghost = a quiet past day, faint = still to come, green =
// today (pulsing). Tap any dot to read its date.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { C, F, SPRING } from '@/lib/theme';
import { useActiveDays } from '@/lib/active-days';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const GUTTER = 16; // month-letter column

export function YearDots() {
  const { year, today, total, active, count, streak } = useActiveDays();
  const [w, setW] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, ...SPRING.settle }).start();
    const l = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, []);

  const pitch = w ? (w - GUTTER) / 31 : 0;
  const dot = Math.max(3, Math.round(pitch * 0.58));
  const gridH = pitch * 12;

  // day-of-year → (month, day) cells
  const cells = useMemo(() => {
    const out: { doy: number; m: number; d: number }[] = [];
    const start = Date.UTC(year, 0, 1);
    for (let i = 0; i < total; i++) {
      const dt = new Date(start + i * 86400000);
      out.push({ doy: i, m: dt.getUTCMonth(), d: dt.getUTCDate() - 1 });
    }
    return out;
  }, [year, total]);

  const todayCell = cells[today];
  const pickedCell = picked != null ? cells[picked] : null;
  const caption = pickedCell
    ? (() => {
        const dt = new Date(year, pickedCell.m, pickedCell.d + 1);
        const state = picked! > today ? 'TO COME' : active.has(picked!) ? 'ACTIVE' : picked === today ? 'TODAY' : 'QUIET';
        return `${DOW[dt.getDay()]} ${String(pickedCell.d + 1).padStart(2, '0')} ${MON[pickedCell.m]}  ${state}`;
      })()
    : `${year}  DAY ${today + 1} OF ${total}`;

  const onPress = (e: any) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const m = Math.floor(y / pitch), d = Math.floor((x - GUTTER) / pitch);
    const c = cells.find(c => c.m === m && c.d === d);
    setPicked(c ? (c.doy === picked ? null : c.doy) : null);
  };

  return (
    <Animated.View style={[styles.card, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      <View style={styles.stats}>
        <Stat value={count} label="ACTIVE" />
        <Stat value={streak} label="STREAK" />
        <Stat value={total - today - 1} label="LEFT" />
      </View>

      <Pressable onPress={onPress} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: gridH || 120 }}>
        {w > 0 && (
          <Svg width={w} height={gridH}>
            {MONTHS.map((l, m) => (
              <SvgText key={m} x={0} y={m * pitch + pitch / 2 + 3} fontSize={8} fill={m === todayCell.m ? C.ink : C.faint} fontFamily={F.dot}>{l}</SvgText>
            ))}
            {cells.map(c => {
              const fill =
                c.doy === picked ? C.live :
                c.doy > today ? '#141414' :
                c.doy === today ? C.bg :
                active.has(c.doy) ? C.ink : C.ghost;
              return (
                <Rect key={c.doy}
                  x={GUTTER + c.d * pitch + (pitch - dot) / 2} y={c.m * pitch + (pitch - dot) / 2}
                  width={dot} height={dot} rx={dot / 2} fill={fill} />
              );
            })}
          </Svg>
        )}
        {w > 0 && (
          <Animated.View pointerEvents="none" style={[styles.today, {
            width: dot + 2, height: dot + 2, borderRadius: (dot + 2) / 2,
            left: GUTTER + todayCell.d * pitch + (pitch - dot) / 2 - 1,
            top: todayCell.m * pitch + (pitch - dot) / 2 - 1,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
          }]} />
        )}
      </Pressable>

      <Text style={styles.caption}>{caption}</Text>
    </Animated.View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 14, paddingBottom: 10, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  stats: { flexDirection: 'row', marginBottom: 12 },
  stat: { flex: 1 },
  statVal: { fontFamily: F.dot, fontSize: 26, color: C.ink },
  statLabel: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2, marginTop: 2 },
  today: { position: 'absolute', backgroundColor: C.live },
  caption: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2, marginTop: 8 },
});
