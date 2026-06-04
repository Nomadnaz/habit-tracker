/**
 * Scroll wheel pickers — same implementation as focus timer duration wheels.
 */
import { useEffect, useLayoutEffect, useRef, useMemo, memo, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  type ViewStyle,
} from 'react-native';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

export const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD_SLOTS = Math.floor(WHEEL_VISIBLE / 2);
export const WHEEL_FRAME_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PERSPECTIVE = 900;
export const WHEEL_DECELERATION = Platform.select({
  ios: 0.985,
  android: 0.972,
  default: 0.980,
});

export type WheelMetrics = {
  itemH: number;
  visible: number;
  padSlots: number;
  frameH: number;
  perspective: number;
  fontSize: number;
  edgeFadeH: number;
};

export function getWheelMetrics(compact = false): WheelMetrics {
  if (compact) {
    const itemH = 30;
    const visible = 3;
    const padSlots = 1;
    return {
      itemH,
      visible,
      padSlots,
      frameH: itemH * visible,
      perspective: 520,
      fontSize: 14,
      edgeFadeH: itemH * 1.05,
    };
  }
  const itemH = WHEEL_ITEM_H;
  const visible = WHEEL_VISIBLE;
  const padSlots = WHEEL_PAD_SLOTS;
  return {
    itemH,
    visible,
    padSlots,
    frameH: itemH * visible,
    perspective: WHEEL_PERSPECTIVE,
    fontSize: 15,
    edgeFadeH: itemH * 1.6,
  };
}

const PIXEL_BORDER = 2;
const PIXEL_CORNER_STEPS = 4;
const PIXEL_BORDER_INSET = PIXEL_CORNER_STEPS * PIXEL_BORDER;

export type WheelPalette = {
  bg: string;
  timer: string;
  label: string;
  trackBorder: string;
};

/** Matches the task creation sheet (light pixel card). */
export const SHEET_WHEEL_PALETTE: WheelPalette = {
  bg: '#FFFFFF',
  timer: '#1A1714',
  label: '#8C857B',
  trackBorder: '#E5E1DA',
};

function clampIndex(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function PixelCornerSteps({ color, corner }: { color: string; corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <>
      {Array.from({ length: PIXEL_CORNER_STEPS }, (_, i) => {
        const w = (PIXEL_CORNER_STEPS - i) * PIXEL_BORDER * 2;
        const base: ViewStyle = {
          position: 'absolute',
          width: w,
          height: PIXEL_BORDER,
          backgroundColor: color,
        };
        const step = i * PIXEL_BORDER;
        if (corner === 'tl') return <View key={`${corner}-${i}`} style={{ ...base, top: step, left: 0 }} />;
        if (corner === 'tr') return <View key={`${corner}-${i}`} style={{ ...base, top: step, right: 0 }} />;
        if (corner === 'bl') return <View key={`${corner}-${i}`} style={{ ...base, bottom: step, left: 0 }} />;
        return <View key={`${corner}-${i}`} style={{ ...base, bottom: step, right: 0 }} />;
      })}
    </>
  );
}

export function PixelBorderBox({
  children,
  borderColor,
  backgroundColor,
}: {
  children: ReactNode;
  borderColor: string;
  backgroundColor: string;
}) {
  const inset = PIXEL_BORDER_INSET;
  return (
    <View style={styles.pixelBorderWrap}>
      <View pointerEvents="none" style={styles.pixelBorderOutline}>
        <PixelCornerSteps color={borderColor} corner="tl" />
        <PixelCornerSteps color={borderColor} corner="tr" />
        <PixelCornerSteps color={borderColor} corner="bl" />
        <PixelCornerSteps color={borderColor} corner="br" />
        <View style={[styles.pixelEdgeH, { top: 0, left: inset, right: inset, backgroundColor: borderColor }]} />
        <View style={[styles.pixelEdgeH, { bottom: 0, left: inset, right: inset, backgroundColor: borderColor }]} />
        <View style={[styles.pixelEdgeV, { left: 0, top: inset, bottom: inset, backgroundColor: borderColor }]} />
        <View style={[styles.pixelEdgeV, { right: 0, top: inset, bottom: inset, backgroundColor: borderColor }]} />
      </View>
      <View style={[styles.pixelBorderContent, { margin: inset, backgroundColor }]}>
        {children}
      </View>
    </View>
  );
}

function WheelEdgeFade({
  palette,
  edge,
  height,
}: {
  palette: WheelPalette;
  edge: 'top' | 'bottom';
  height: number;
}) {
  const steps = [0.95, 0.7, 0.4, 0.15, 0];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.wheelEdgeFade,
        { height },
        edge === 'top' ? styles.wheelEdgeFadeTop : styles.wheelEdgeFadeBottom,
      ]}
    >
      {steps.map((op, i) => (
        <View key={`${edge}-${i}`} style={{ flex: 1, backgroundColor: palette.bg, opacity: op }} />
      ))}
    </View>
  );
}

const WheelPickerRow = memo(function WheelPickerRow({
  index,
  value,
  scrollY,
  palette,
  formatValue,
  metrics,
}: {
  index: number;
  value: number;
  scrollY: Animated.Value;
  palette: WheelPalette;
  formatValue: (n: number) => string;
  metrics: WheelMetrics;
}) {
  const { itemH, fontSize } = metrics;
  const center = index * itemH;
  const curve = [
    center - 2 * itemH,
    center - itemH,
    center,
    center + itemH,
    center + 2 * itemH,
  ];

  const opacity = scrollY.interpolate({
    inputRange: curve,
    outputRange: [0.06, 0.22, 1, 0.22, 0.06],
    extrapolate: 'clamp',
  });
  const scale = scrollY.interpolate({
    inputRange: curve,
    outputRange: [0.62, 0.8, 1, 0.8, 0.62],
    extrapolate: 'clamp',
  });
  const rotateX = scrollY.interpolate({
    inputRange: curve,
    outputRange: ['36deg', '18deg', '0deg', '-18deg', '-36deg'],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.wheelPickerItem,
        { height: itemH, opacity, transform: [{ rotateX }, { scale }] },
      ]}
    >
      <Animated.Text
        style={[styles.wheelPickerItemText, { color: palette.timer, fontSize }]}
      >
        {formatValue(value)}
      </Animated.Text>
    </Animated.View>
  );
});

export const ValueWheelPicker = memo(function ValueWheelPicker({
  label,
  min,
  max,
  value,
  palette,
  formatValue,
  onPreview,
  onCommit,
  compact = false,
  showLabel = true,
  nativeScroll = false,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  palette: WheelPalette;
  formatValue: (n: number) => string;
  onPreview: (n: number) => void;
  onCommit: (n: number) => void;
  compact?: boolean;
  showLabel?: boolean;
  // Native driver = silky 60fps, but breaks scroll sync inside modals/sheets.
  // Only enable for wheels NOT inside a Modal (e.g. focus timer, today date wheel).
  nativeScroll?: boolean;
}) {
  const metrics = useMemo(() => getWheelMetrics(compact), [compact]);
  const { itemH, padSlots, frameH, perspective, edgeFadeH } = metrics;

  const scrollRef = useRef<Animated.ScrollView>(null);
  const lastIndexRef = useRef(clampIndex(value, min, max) - min);
  const lastPreviewIndexRef = useRef(lastIndexRef.current);
  const lastHapticIndexRef = useRef(lastIndexRef.current);
  const lastHapticAtRef = useRef(0);
  const userScrollingRef = useRef(false);
  const previewRafRef = useRef<number | null>(null);

  const values = useMemo(() => {
    const arr: number[] = [];
    for (let m = min; m <= max; m++) arr.push(m);
    return arr;
  }, [min, max]);

  const padY = padSlots * itemH;
  const initialY = (clampIndex(value, min, max) - min) * itemH;
  const scrollY = useRef(new Animated.Value(initialY)).current;

  useLayoutEffect(() => {
    if (userScrollingRef.current) return;
    const idx = clampIndex(value, min, max) - min;
    const y = idx * itemH;
    lastIndexRef.current = idx;
    lastPreviewIndexRef.current = idx;
    lastHapticIndexRef.current = idx;
    scrollY.setValue(y);
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [value, min, max, scrollY, itemH]);

  function centredIndex(y: number) {
    let index = Math.round(y / itemH);
    if (index < 0) index = 0;
    if (index > values.length - 1) index = values.length - 1;
    return index;
  }

  function previewAtOffset(y: number, fireHaptic: boolean) {
    const index = centredIndex(y);
    if (fireHaptic && index !== lastHapticIndexRef.current) {
      const now = Date.now();
      // 30ms throttle — fires on every notch even during fast flicks
      if (now - lastHapticAtRef.current > 30) {
        lastHapticAtRef.current = now;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      lastHapticIndexRef.current = index;
    }
    if (index === lastPreviewIndexRef.current) return;
    lastPreviewIndexRef.current = index;
    onPreview(values[index]);
  }

  // Call directly — no RAF batching so every scroll event updates the timer immediately.
  function schedulePreview(y: number, fireHaptic: boolean) {
    previewAtOffset(y, fireHaptic);
  }

  useEffect(() => () => {
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
  }, []);

  function commitSelection(y: number) {
    const index = centredIndex(y);
    lastIndexRef.current = index;
    lastPreviewIndexRef.current = index;
    onCommit(values[index]);
  }

  function finishScroll(e: NativeSyntheticEvent<NativeScrollEvent>, fireHaptic: boolean) {
    userScrollingRef.current = false;
    const y = e.nativeEvent.contentOffset.y;
    if (previewRafRef.current != null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    previewAtOffset(y, fireHaptic);
    commitSelection(y);
  }

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      // Native driver = silky, but desyncs scroll inside modals (freezes the wheel).
      // false is required for modal/sheet wheels; true is safe everywhere else.
      useNativeDriver: nativeScroll,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        schedulePreview(e.nativeEvent.contentOffset.y, userScrollingRef.current);
      },
    },
  );

  const selTop = padSlots * itemH;

  return (
    <View style={[styles.wheelPickerCol, compact && styles.wheelPickerColCompact]}>
      {showLabel ? (
        <Text style={[styles.wheelPickerLabel, compact && styles.wheelPickerLabelCompact, { color: palette.label }]}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.wheelPickerFrame, { height: frameH }]}>
        <WheelEdgeFade palette={palette} edge="top" height={edgeFadeH} />
        <WheelEdgeFade palette={palette} edge="bottom" height={edgeFadeH} />
        <View style={[styles.wheelPickerInner, { height: frameH, transform: [{ perspective }] }]} pointerEvents="box-none">
          <View style={styles.wheelPickerSelLines} pointerEvents="none">
            <View style={[styles.wheelPickerSelLine, { top: selTop - 1, backgroundColor: palette.trackBorder }]} />
            <View style={[styles.wheelPickerSelLine, { top: selTop + itemH, backgroundColor: palette.trackBorder }]} />
          </View>
          <Animated.ScrollView
            style={[styles.wheelPickerScroll, { height: frameH }]}
            ref={scrollRef}
            contentOffset={{ x: 0, y: initialY }}
            nestedScrollEnabled
            scrollEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={itemH}
            snapToAlignment="start"
            decelerationRate={WHEEL_DECELERATION}
            disableIntervalMomentum={false}
            bounces={false}
            overScrollMode="never"
            contentContainerStyle={{ paddingVertical: padY }}
            scrollEventThrottle={1}
            onScroll={onScroll}
            onScrollBeginDrag={() => {
              userScrollingRef.current = true;
            }}
            onScrollEndDrag={e => {
              const vy = e.nativeEvent.velocity?.y ?? 0;
              if (Math.abs(vy) < 0.12) finishScroll(e, true);
            }}
            onMomentumScrollEnd={e => finishScroll(e, true)}
          >
            {values.map((v, i) => (
              <WheelPickerRow
                key={`${label}-${v}`}
                index={i}
                value={v}
                scrollY={scrollY}
                palette={palette}
                formatValue={formatValue}
                metrics={metrics}
              />
            ))}
          </Animated.ScrollView>
        </View>
      </View>
    </View>
  );
});

/** Focus timer style: values shown as "N min". */
export const MinuteWheelPicker = memo(function MinuteWheelPicker(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  palette: WheelPalette;
  onPreview: (mins: number) => void;
  onCommit: (mins: number) => void;
}) {
  return (
    <ValueWheelPicker
      {...props}
      formatValue={m => `${m} min`}
      nativeScroll      // focus timer panel is inline (not a modal) — native is safe + smooth
    />
  );
});

type TimeOfDayWheelPickerProps = {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onHourCommit?: (h: number) => void;
  onMinuteCommit?: (m: number) => void;
  palette?: WheelPalette;
  /** Same framed scroll wheels as focus timer settings (PixelBorderBox + full-size pickers). */
  focusTimerStyle?: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatHour12(h: number) {
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12} ${ampm}`;
}

/** Hour + minute wheels — use focusTimerStyle to match focus timer duration wheels. */
export function TimeOfDayWheelPicker({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  onHourCommit,
  onMinuteCommit,
  palette = SHEET_WHEEL_PALETTE,
  focusTimerStyle = false,
}: TimeOfDayWheelPickerProps) {
  const commitHour = onHourCommit ?? onHourChange;
  const commitMinute = onMinuteCommit ?? onMinuteChange;
  const wheels = (
    <View style={[styles.timeWheelsRow, focusTimerStyle && styles.timeWheelsRowFramed]}>
      <ValueWheelPicker
        label="HOUR"
        min={0}
        max={23}
        value={hour}
        palette={palette}
        formatValue={focusTimerStyle ? formatHour12 : pad2}
        onPreview={onHourChange}
        onCommit={commitHour}
        compact={!focusTimerStyle}
        showLabel={focusTimerStyle}
        nativeScroll={focusTimerStyle}
      />
      {!focusTimerStyle && (
        <Text style={[styles.timeColon, { color: palette.timer }]}>:</Text>
      )}
      <ValueWheelPicker
        label="MINUTE"
        min={0}
        max={59}
        value={minute}
        palette={palette}
        formatValue={focusTimerStyle ? (m: number) => `${m} min` : pad2}
        onPreview={onMinuteChange}
        onCommit={commitMinute}
        nativeScroll={focusTimerStyle}
        compact={!focusTimerStyle}
        showLabel={focusTimerStyle}
      />
    </View>
  );

  if (focusTimerStyle) {
    return (
      <View style={[styles.timeWheelsWrap, styles.timeWheelsWrapFramed]}>
        <PixelBorderBox borderColor={palette.trackBorder} backgroundColor={palette.bg}>
          <View style={styles.settingsWheelsRow}>{wheels}</View>
        </PixelBorderBox>
      </View>
    );
  }

  return (
    <View style={styles.timeWheelsWrap}>
      <Text style={styles.timeWheelsHeading}>TIME</Text>
      {wheels}
    </View>
  );
}

const styles = StyleSheet.create({
  pixelBorderWrap: { position: 'relative', width: '100%' },
  pixelBorderOutline: { ...StyleSheet.absoluteFillObject },
  pixelEdgeH: { position: 'absolute', height: PIXEL_BORDER },
  pixelEdgeV: { position: 'absolute', width: PIXEL_BORDER },
  pixelBorderContent: { paddingVertical: 14, paddingHorizontal: 16 },
  settingsWheelsRow: { flexDirection: 'row', gap: 12 },
  timeWheelsWrap: { width: '100%', marginBottom: 10, alignItems: 'center' },
  timeWheelsWrapFramed: { alignItems: 'stretch' },
  timeWheelsHeading: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    color: '#8C857B',
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  timeWheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    maxWidth: 220,
  },
  timeWheelsRowFramed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  timeColon: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 18,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  wheelPickerCol: { flex: 1, alignItems: 'center' },
  wheelPickerColCompact: { flex: 0, minWidth: 72 },
  wheelPickerLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  wheelPickerLabelCompact: { marginBottom: 0 },
  wheelPickerFrame: { width: '100%', overflow: 'hidden' },
  wheelPickerInner: { transform: [{ perspective: WHEEL_PERSPECTIVE }] },
  wheelPickerScroll: {},
  wheelPickerSelLines: { ...StyleSheet.absoluteFillObject, zIndex: 4 },
  wheelPickerSelLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: StyleSheet.hairlineWidth * 2,
    opacity: 0.85,
  },
  wheelEdgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    flexDirection: 'column',
  },
  wheelEdgeFadeTop: { top: 0 },
  wheelEdgeFadeBottom: { bottom: 0, flexDirection: 'column-reverse' },
  wheelPickerItem: { justifyContent: 'center', alignItems: 'center' },
  wheelPickerItemText: {
    fontFamily: 'PixeloidSans_700Bold',
    letterSpacing: 0.5,
  },
});
