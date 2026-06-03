import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// ── Types ─────────────────────────────────────────────────────────
type Phase = 'focus' | 'break';

export default function FocusTimerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name: string; workMins: string; breakMins: string }>();

  const workSecs  = (parseInt(params.workMins,  10) || 90) * 60;
  const breakSecs = (parseInt(params.breakMins, 10) || 20) * 60;
  const focusName = params.name ?? 'FOCUS';

  // ── State ──────────────────────────────────────────────────────
  const [phase,     setPhase]     = useState<Phase>('focus');
  const [secsLeft,  setSecsLeft]  = useState(workSecs);
  const [running,   setRunning]   = useState(false);
  const [round,     setRound]     = useState(1);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  // Track when the timer was last paused so we can adjust after backgrounding.
  const bgTimestampRef = useRef<number | null>(null);

  // ── Helpers ────────────────────────────────────────────────────
  function pad(n: number) {
    return String(Math.floor(n)).padStart(2, '0');
  }

  const minutes = pad(secsLeft / 60);
  const seconds = pad(secsLeft % 60);
  const totalSecs = phase === 'focus' ? workSecs : breakSecs;
  const progress = 1 - secsLeft / totalSecs; // 0 → 1 as time counts down

  function advancePhase() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (phase === 'focus') {
      setPhase('break');
      setSecsLeft(breakSecs);
    } else {
      setPhase('focus');
      setSecsLeft(workSecs);
      setRound(r => r + 1);
    }
  }

  // ── Tick ──────────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            advancePhase();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, phase]);

  // ── Background / foreground handling ──────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appStateRef.current === 'active' && nextState.match(/inactive|background/)) {
        // Going to background — note the time.
        bgTimestampRef.current = running ? Date.now() : null;
      }
      if (nextState === 'active' && bgTimestampRef.current !== null) {
        // Coming back — deduct elapsed time.
        const elapsed = Math.floor((Date.now() - bgTimestampRef.current) / 1000);
        bgTimestampRef.current = null;
        setSecsLeft(s => Math.max(0, s - elapsed));
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [running]);

  // ── UI ────────────────────────────────────────────────────────
  const isBreak = phase === 'break';

  return (
    <SafeAreaView style={[styles.container, isBreak && styles.containerBreak]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={isBreak ? '#FCFBF9' : '#1A1714'} />
        </TouchableOpacity>
        <Text style={[styles.roundLabel, isBreak && styles.textLight]}>ROUND {round}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Phase label */}
      <View style={styles.phaseWrap}>
        <View style={[styles.phasePill, isBreak && styles.phasePillBreak]}>
          <Text style={[styles.phaseText, isBreak && styles.phaseTextBreak]}>
            {isBreak ? 'BREAK' : 'FOCUS'}
          </Text>
        </View>
      </View>

      {/* Focus name */}
      <Text style={[styles.focusName, isBreak && styles.textLight]} numberOfLines={2}>
        {isBreak ? 'REST UP.' : focusName}
      </Text>

      {/* Big timer display */}
      <View style={styles.timerWrap}>
        <Text style={[styles.timer, isBreak && styles.textLight]}>
          {minutes}<Text style={[styles.timerColon, isBreak && styles.textLight]}>:</Text>{seconds}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[
          styles.progressFill,
          { width: `${progress * 100}%` as any },
          isBreak && styles.progressFillBreak,
        ]} />
      </View>

      {/* Break reminder */}
      <Text style={[styles.subLabel, isBreak && styles.textLight]}>
        {isBreak
          ? `${params.workMins} MIN FOCUS COMPLETED`
          : `${params.breakMins} MIN BREAK AFTER`}
      </Text>

      {/* Controls */}
      <View style={styles.controls}>

        {/* Skip phase */}
        <TouchableOpacity style={styles.controlSecondary} onPress={advancePhase} activeOpacity={0.7}>
          <MaterialCommunityIcons name="skip-next" size={24} color={isBreak ? '#FCFBF9' : '#8C857B'} />
        </TouchableOpacity>

        {/* Play / Pause */}
        <TouchableOpacity
          style={[styles.controlPrimary, isBreak && styles.controlPrimaryBreak]}
          onPress={() => setRunning(r => !r)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={running ? 'pause' : 'play'}
            size={32}
            color={isBreak ? '#FF4D00' : '#FCFBF9'}
          />
        </TouchableOpacity>

        {/* Stop */}
        <TouchableOpacity style={styles.controlSecondary} onPress={() => {
          setRunning(false);
          router.back();
        }} activeOpacity={0.7}>
          <MaterialCommunityIcons name="stop" size={24} color={isBreak ? '#FCFBF9' : '#8C857B'} />
        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F0EC',
    paddingHorizontal: 24,
  },
  containerBreak: {
    backgroundColor: '#FF4D00',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 16,
  },
  roundLabel: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    color: '#8C857B',
    letterSpacing: 1,
  },
  phaseWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  phasePill: {
    backgroundColor: '#FF4D00',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  phasePillBreak: {
    backgroundColor: '#FCFBF9',
  },
  phaseText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 12,
    color: '#FCFBF9',
    letterSpacing: 2,
  },
  phaseTextBreak: {
    color: '#FF4D00',
  },
  focusName: {
    fontFamily: 'PressStart2P_400Regular',
    fontSize: 22,
    color: '#1A1714',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 40,
  },
  timerWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },
  timer: {
    fontFamily: 'PressStart2P_400Regular',
    fontSize: 72,
    color: '#1A1714',
    letterSpacing: -2,
  },
  timerColon: {
    fontSize: 60,
    color: '#1A1714',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#E5E1DA',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF4D00',
    borderRadius: 2,
  },
  progressFillBreak: {
    backgroundColor: '#FCFBF9',
  },
  subLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    color: '#8C857B',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 48,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  controlPrimary: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF4D00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPrimaryBreak: {
    backgroundColor: '#FCFBF9',
  },
  controlSecondary: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#E5E1DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textLight: {
    color: '#FCFBF9',
  },
});
