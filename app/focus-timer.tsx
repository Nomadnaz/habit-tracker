import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FOCUS_SESSION_KEY,
  FOCUS_SETTINGS_KEY,
  parseFocusNameFromSettings,
  type PersistedFocusSession,
} from '@/lib/focus-session';
import {
  DEFAULT_BREAK_MINS,
  DEFAULT_WORK_MINS,
  persistTimerDurations,
  readFocusSettingsLocal,
} from '@/lib/focus-settings';
import { supabase } from '@/lib/supabase';
import { MinuteWheelPicker } from '@/components/WheelPicker';

// Leaving twice (whether running OR paused) = failed session.
const STRIKE_LIMIT = 2;
const THEME_KEY = '@focus_timer_theme';

type ColorTheme = 'dark' | 'light';

const PALETTE = {
  dark: {
    bg: '#0D0C0B',
    timer: '#FCFBF9',
    timerDim: '#3A3836',
    label: '#5A5653',
    muted: '#3A3836',
    track: '#2A2826',
    trackBorder: '#3A3836',
    pillBg: '#1E1D1C',
    cancelBorder: '#2A2826',
    startBorder: '#FF4D00',
    pauseIcon: '#FCFBF9',
  },
  light: {
    bg: '#FCFBF9',
    timer: '#0D0C0B',
    timerDim: '#B8B5B0',
    label: '#5A5653',
    muted: '#8A8683',
    track: '#E5E3E0',
    trackBorder: '#C8C5C0',
    pillBg: '#F0EEEB',
    cancelBorder: '#D5D2CD',
    startBorder: '#FF4D00',
    pauseIcon: '#FCFBF9',
  },
} as const;

const CIRCLE_BTN_SIZE = 72;
const THEME_SLIDER_W = 64;
const THEME_SLIDER_H = 32;
const THEME_THUMB_SIZE = 24;
const THEME_SLIDER_PAD = 4;
const THEME_THUMB_TRAVEL = THEME_SLIDER_W - THEME_THUMB_SIZE - THEME_SLIDER_PAD * 2;

type Phase = 'focus' | 'break';

const MIN_FOCUS_MIN = 1;
const MAX_FOCUS_MIN = 180;
const MIN_BREAK_MIN = 1;
const MAX_BREAK_MIN = 60;

const WHEEL_PERSIST_DEBOUNCE_MS = 80;

function clampMins(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type TimerPalette = (typeof PALETTE)['dark'];

type DurationSettingsPanelProps = {
  palette: TimerPalette;
  workMins: number;
  breakMins: number;
  onPreviewWork: (mins: number) => void;
  onPreviewBreak: (mins: number) => void;
  onCommitWork: (mins: number) => void;
  onCommitBreak: (mins: number) => void;
};

function DurationSettingsPanel({
  palette,
  workMins,
  breakMins,
  onPreviewWork,
  onPreviewBreak,
  onCommitWork,
  onCommitBreak,
}: DurationSettingsPanelProps) {
  return (
    <View style={styles.settingsWrap}>
      <View style={styles.settingsWheelsRow}>
        <MinuteWheelPicker
          label="FOCUS"
          min={MIN_FOCUS_MIN}
          max={MAX_FOCUS_MIN}
          value={workMins}
          palette={palette}
          onPreview={onPreviewWork}
          onCommit={onCommitWork}
        />
        <MinuteWheelPicker
          label="BREAK"
          min={MIN_BREAK_MIN}
          max={MAX_BREAK_MIN}
          value={breakMins}
          palette={palette}
          onPreview={onPreviewBreak}
          onCommit={onCommitBreak}
        />
      </View>
    </View>
  );
}

export default function FocusTimerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name: string; workMins: string; breakMins: string }>();

  const paramWorkMins  = parseInt(params.workMins ?? '', 10) || DEFAULT_WORK_MINS;
  const paramBreakMins = parseInt(params.breakMins ?? '', 10) || DEFAULT_BREAK_MINS;
  const paramWorkSecs  = paramWorkMins * 60;
  const paramBreakSecs = paramBreakMins * 60;
  const paramFocusName = (params.name ?? 'FOCUS').toUpperCase();
  const hasLaunchParams = Boolean(params.workMins && params.name);

  const [sessionReady, setSessionReady] = useState(false);
  const [workSecs,  setWorkSecs]  = useState(paramWorkSecs);
  const [breakSecs, setBreakSecs] = useState(paramBreakSecs);
  const [focusName, setFocusName] = useState(paramFocusName);

  // ── Session state ──────────────────────────────────────────────
  const [started,  setStarted]  = useState(false);
  const [running,  setRunning]  = useState(false);
  const [failed,   setFailed]   = useState(false);
  const [phase,    setPhase]    = useState<Phase>('focus');
  const [secsLeft, setSecsLeft] = useState(paramWorkSecs);
  const [strikes,  setStrikes]  = useState(0);
  const [round,    setRound]    = useState(1);
  const [banner,      setBanner]      = useState('');
  const [colorTheme,  setColorTheme]  = useState<ColorTheme>('dark');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftWorkMins, setDraftWorkMins] = useState(90);
  const [draftBreakMins, setDraftBreakMins] = useState(20);

  // Refs — readable inside async callbacks & AppState listener without stale closures.
  const runningRef  = useRef(false);
  const startedRef  = useRef(false);  // strikes fire whenever session is started, even if paused
  const strikesRef  = useRef(0);
  const failedRef   = useRef(false);
  const secsLeftRef = useRef(paramWorkSecs);
  const phaseRef    = useRef<Phase>('focus');
  const roundRef    = useRef(1);
  const workSecsRef  = useRef(paramWorkSecs);
  const breakSecsRef = useRef(paramBreakSecs);
  const focusNameRef = useRef(paramFocusName);

  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef    = useRef(AppState.currentState);
  const bgTimestampRef = useRef<number | null>(null);

  const bannerY       = useRef(new Animated.Value(-100)).current;
  const strikeFlash   = useRef(new Animated.Value(0)).current;
  const themeThumbPos = useRef(new Animated.Value(colorTheme === 'dark' ? 0 : 1)).current;
  const durationApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDurationRef = useRef<{ workMins: number; breakMins: number } | null>(null);

  // ── Helpers ────────────────────────────────────────────────────
  function pad(n: number) { return String(Math.floor(n)).padStart(2, '0'); }

  const totalSecs = phase === 'focus' ? workSecs : breakSecs;
  const progress  = Math.min(1, 1 - secsLeft / totalSecs);
  const minutes   = pad(secsLeft / 60);
  const seconds   = pad(secsLeft % 60);
  const isBreak   = phase === 'break';

  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  // ── Keep refs in sync with state ──────────────────────────────
  useEffect(() => { runningRef.current  = running;  }, [running]);
  useEffect(() => { startedRef.current  = started;  }, [started]);
  useEffect(() => { strikesRef.current  = strikes;  }, [strikes]);
  useEffect(() => { failedRef.current   = failed;   }, [failed]);
  useEffect(() => { secsLeftRef.current = secsLeft; }, [secsLeft]);
  useEffect(() => { phaseRef.current    = phase;    }, [phase]);
  useEffect(() => { roundRef.current    = round;    }, [round]);
  useEffect(() => { workSecsRef.current  = workSecs;  }, [workSecs]);
  useEffect(() => { breakSecsRef.current = breakSecs; }, [breakSecs]);
  useEffect(() => { focusNameRef.current = focusName; }, [focusName]);

  // ── Allow rotation; lock portrait again on exit ───────────────
  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // ── Persist helpers ───────────────────────────────────────────
  async function saveSession() {
    if (!startedRef.current || failedRef.current) return;
    const data: PersistedFocusSession = {
      secsLeft:  secsLeftRef.current,
      phase:     phaseRef.current,
      running:   runningRef.current,
      strikes:   strikesRef.current,
      round:     roundRef.current,
      started:   startedRef.current,
      savedAt:   Date.now(),
      workSecs:  workSecsRef.current,
      breakSecs: breakSecsRef.current,
      focusName: focusNameRef.current,
    };
    await AsyncStorage.setItem(FOCUS_SESSION_KEY, JSON.stringify(data));
  }

  async function clearSession() {
    await AsyncStorage.removeItem(FOCUS_SESSION_KEY);
  }

  // ── Restore color theme preference ─────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(raw => {
      if (raw === 'light' || raw === 'dark') setColorTheme(raw);
    });
  }, []);

  function toggleColorTheme(next: ColorTheme) {
    setColorTheme(next);
    AsyncStorage.setItem(THEME_KEY, next);
    tapHaptic();
  }

  function flipColorTheme() {
    toggleColorTheme(colorTheme === 'dark' ? 'light' : 'dark');
  }

  function tapHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  useEffect(() => {
    Animated.spring(themeThumbPos, {
      toValue: colorTheme === 'dark' ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 140,
    }).start();
  }, [colorTheme]);

  const themeThumbX = themeThumbPos.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME_SLIDER_PAD, THEME_THUMB_TRAVEL],
  });

  const palette = PALETTE[colorTheme];
  const phaseLabelColor = colorTheme === 'dark' ? '#FCFBF9' : '#0D0C0B';

  // ── Restore saved session on mount (resume without params, or matching launch) ──
  useEffect(() => {
    async function restore() {
      const raw = await AsyncStorage.getItem(FOCUS_SESSION_KEY);

      if (raw) {
        const s: PersistedFocusSession = JSON.parse(raw);
        const matchesLaunch =
          s.workSecs === paramWorkSecs && s.breakSecs === paramBreakSecs;

        if (s.started && (!hasLaunchParams || matchesLaunch)) {
          const settingsRaw = await AsyncStorage.getItem(FOCUS_SETTINGS_KEY);
          const latestName =
            parseFocusNameFromSettings(settingsRaw).toUpperCase() || s.focusName;

          setWorkSecs(s.workSecs);
          setBreakSecs(s.breakSecs);
          setFocusName(latestName);
          workSecsRef.current = s.workSecs;
          breakSecsRef.current = s.breakSecs;
          focusNameRef.current = latestName;

          let secs = s.secsLeft;
          if (s.running) {
            const elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
            secs = Math.max(1, secs - elapsed);
          }

          secsLeftRef.current = secs;
          phaseRef.current = s.phase;
          roundRef.current = s.round;
          strikesRef.current = s.strikes;
          startedRef.current = s.started;
          runningRef.current = s.running && s.started;

          setSecsLeft(secs);
          setPhase(s.phase);
          setStrikes(s.strikes);
          setRound(s.round);
          setStarted(s.started);
          setRunning(s.running && s.started);
          setSessionReady(true);
          return;
        }

        if (hasLaunchParams && !matchesLaunch) {
          await clearSession();
        }
      }

      const saved = await readFocusSettingsLocal();
      const workMins = saved?.workMins ?? paramWorkMins;
      const breakMins = saved?.breakMins ?? paramBreakMins;
      const w = workMins * 60;
      const b = breakMins * 60;
      const name = saved?.name?.trim() ? saved.name.toUpperCase() : paramFocusName;

      setWorkSecs(w);
      setBreakSecs(b);
      setFocusName(name);
      workSecsRef.current = w;
      breakSecsRef.current = b;
      focusNameRef.current = name;
      secsLeftRef.current = w;
      setSecsLeft(w);
      setDraftWorkMins(workMins);
      setDraftBreakMins(breakMins);
      setSessionReady(true);
    }
    restore();
  }, []);

  // ── Save on unmount (leave timer screen without cancelling) ─────
  useEffect(() => {
    return () => {
      if (startedRef.current && !failedRef.current) {
        saveSession();
      }
    };
  }, []);

  // ── Periodic save while session is active (app force-close safety) ──
  useEffect(() => {
    if (!started || failed) return;
    const id = setInterval(() => saveSession(), 8000);
    return () => clearInterval(id);
  }, [started, failed]);

  // Pick up focus name changes from the home screen (e.g. after ✕ exit + rename + resume).
  useFocusEffect(
    useCallback(() => {
      if (!sessionReady) return;
      AsyncStorage.getItem(FOCUS_SETTINGS_KEY).then(raw => {
        const latest = parseFocusNameFromSettings(raw).toUpperCase();
        if (!latest || latest === focusNameRef.current) return;
        setFocusName(latest);
        focusNameRef.current = latest;
        if (startedRef.current && !failedRef.current) saveSession();
      });
    }, [sessionReady]),
  );

  // ── Tick ───────────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            runningRef.current = false;
            setRunning(false);
            advancePhase();
            secsLeftRef.current = 0;
            return 0;
          }
          const next = s - 1;
          secsLeftRef.current = next;
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, phase]);

  // ── AppState — strike fires whenever STARTED, even if paused ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      // Going to background / inactive
      if (
        appStateRef.current === 'active' &&
        next.match(/inactive|background/) &&
        startedRef.current &&
        !failedRef.current
      ) {
        saveSession();

        bgTimestampRef.current = Date.now();
        const newStrikes = strikesRef.current + 1;
        strikesRef.current = newStrikes;
        setStrikes(newStrikes);

        if (newStrikes >= STRIKE_LIMIT) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRunning(false);
          setFailed(true);
          clearSession();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }

      // Coming back to foreground
      if (next === 'active' && bgTimestampRef.current !== null) {
        const elapsed = Math.floor((Date.now() - bgTimestampRef.current) / 1000);
        bgTimestampRef.current = null;

        // Deduct elapsed time only if timer was actively running.
        if (runningRef.current) {
          setSecsLeft(s => Math.max(1, s - elapsed));
        }

        if (strikesRef.current > 0 && strikesRef.current < STRIKE_LIMIT && !failedRef.current) {
          flashStrikeBanner(`⚡ STRIKE ${strikesRef.current} — ONE MORE AND YOU FAIL`);
          flashScreen();
        }
      }

      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // ── Banner animation ───────────────────────────────────────────
  function flashStrikeBanner(message: string) {
    setBanner(message);
    bannerY.setValue(-100);
    Animated.sequence([
      Animated.spring(bannerY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 120 }),
      Animated.delay(3500),
      Animated.timing(bannerY, { toValue: -100, useNativeDriver: true, duration: 250 }),
    ]).start(() => setBanner(''));
  }

  function flashScreen() {
    strikeFlash.setValue(1);
    Animated.timing(strikeFlash, { toValue: 0, duration: 600, useNativeDriver: true }).start();
  }

  // ── Phase advance ──────────────────────────────────────────────
  function advancePhase() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase(p => {
      if (p === 'focus') {
        secsLeftRef.current = breakSecsRef.current;
        setSecsLeft(breakSecsRef.current);
        phaseRef.current = 'break';
        return 'break';
      }
      secsLeftRef.current = workSecsRef.current;
      setSecsLeft(workSecsRef.current);
      roundRef.current = roundRef.current + 1;
      setRound(roundRef.current);
      phaseRef.current = 'focus';
      return 'focus';
    });
    saveSession();
  }

  function handleStart() {
    startedRef.current = true;
    runningRef.current = true;
    setStarted(true);
    setRunning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    saveSession();
  }

  function handlePause() {
    tapHaptic();
    const nextRunning = !runningRef.current;
    runningRef.current = nextRunning;
    setRunning(nextRunning);
    saveSession();
  }

  function resetSessionToStart() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    runningRef.current = false;
    startedRef.current = false;
    failedRef.current = false;
    strikesRef.current = 0;
    secsLeftRef.current = workSecsRef.current;
    phaseRef.current = 'focus';
    roundRef.current = 1;
    setRunning(false);
    setStarted(false);
    setFailed(false);
    setPhase('focus');
    setSecsLeft(workSecsRef.current);
    setStrikes(0);
    setRound(1);
    setBanner('');
  }

  async function handleExit() {
    tapHaptic();
    if (startedRef.current && !failedRef.current) {
      await saveSession();
    }
    router.back();
  }

  function flushDurationApply() {
    if (!durationApplyTimerRef.current || !pendingDurationRef.current) return;
    clearTimeout(durationApplyTimerRef.current);
    durationApplyTimerRef.current = null;
    const { workMins, breakMins } = pendingDurationRef.current;
    pendingDurationRef.current = null;
    void applyDurationSettings(workMins, breakMins);
  }

  function scheduleDurationApply(workMins: number, breakMins: number) {
    pendingDurationRef.current = { workMins, breakMins };
    if (durationApplyTimerRef.current) clearTimeout(durationApplyTimerRef.current);
    durationApplyTimerRef.current = setTimeout(() => {
      durationApplyTimerRef.current = null;
      pendingDurationRef.current = null;
      void applyDurationSettings(workMins, breakMins);
    }, WHEEL_PERSIST_DEBOUNCE_MS);
  }

  function previewWorkMins(mins: number) {
    const wMins = clampMins(mins, MIN_FOCUS_MIN, MAX_FOCUS_MIN);
    const w = wMins * 60;
    workSecsRef.current = w;
    setWorkSecs(w);
    if (phaseRef.current === 'focus') {
      secsLeftRef.current = w;
      setSecsLeft(w);
    }
  }

  function previewBreakMins(mins: number) {
    const bMins = clampMins(mins, MIN_BREAK_MIN, MAX_BREAK_MIN);
    const b = bMins * 60;
    breakSecsRef.current = b;
    setBreakSecs(b);
    if (phaseRef.current === 'break') {
      secsLeftRef.current = b;
      setSecsLeft(b);
    }
  }

  function previewTimerDurations(workMins: number, breakMins: number) {
    previewWorkMins(workMins);
    previewBreakMins(breakMins);
    setDraftWorkMins(clampMins(workMins, MIN_FOCUS_MIN, MAX_FOCUS_MIN));
    setDraftBreakMins(clampMins(breakMins, MIN_BREAK_MIN, MAX_BREAK_MIN));
  }

  async function applyDurationSettings(workMins: number, breakMins: number) {
    previewTimerDurations(workMins, breakMins);
    if (startedRef.current) saveSession();

    const { data: { session } } = await supabase.auth.getSession();
    await persistTimerDurations(
      clampMins(workMins, MIN_FOCUS_MIN, MAX_FOCUS_MIN),
      clampMins(breakMins, MIN_BREAK_MIN, MAX_BREAK_MIN),
      session?.user?.id ?? null,
    );
  }

  function toggleSettings() {
    tapHaptic();
    if (!settingsOpen) {
      if (runningRef.current) {
        runningRef.current = false;
        setRunning(false);
      }
      setDraftWorkMins(Math.round(workSecsRef.current / 60));
      setDraftBreakMins(Math.round(breakSecsRef.current / 60));
      setSettingsOpen(true);
      return;
    }
    flushDurationApply();
    setSettingsOpen(false);
    if (startedRef.current) saveSession();
  }

  async function handleTryAgain() {
    resetSessionToStart();
    await clearSession();
    router.replace('/(tabs)');
  }

  const handlePreviewWork = useCallback((mins: number) => {
    previewWorkMins(mins);
  }, []);

  const handlePreviewBreak = useCallback((mins: number) => {
    previewBreakMins(mins);
  }, []);

  const handleCommitWork = useCallback((mins: number) => {
    setDraftWorkMins(clampMins(mins, MIN_FOCUS_MIN, MAX_FOCUS_MIN));
    scheduleDurationApply(mins, Math.round(breakSecsRef.current / 60));
  }, []);

  const handleCommitBreak = useCallback((mins: number) => {
    setDraftBreakMins(clampMins(mins, MIN_BREAK_MIN, MAX_BREAK_MIN));
    scheduleDurationApply(Math.round(workSecsRef.current / 60), mins);
  }, []);

  async function handleCancel() {
    tapHaptic();
    setSettingsOpen(false);
    resetSessionToStart();
    await clearSession();
    router.back();
  }

  const settingsPanel = settingsOpen ? (
    <DurationSettingsPanel
      palette={palette}
      workMins={draftWorkMins}
      breakMins={draftBreakMins}
      onPreviewWork={handlePreviewWork}
      onPreviewBreak={handlePreviewBreak}
      onCommitWork={handleCommitWork}
      onCommitBreak={handleCommitBreak}
    />
  ) : null;

  const settingsCancelBtn =
    settingsOpen && started ? (
      <TouchableOpacity
        style={styles.settingsCancelTouch}
        onPress={() => void handleCancel()}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
      >
        <Text style={styles.settingsCancelText}>cancel</Text>
      </TouchableOpacity>
    ) : null;

  const themeToggle = (
    <TouchableOpacity
      style={styles.themeSlider}
      onPress={flipColorTheme}
      activeOpacity={0.88}
      accessibilityRole="switch"
      accessibilityState={{ checked: colorTheme === 'light' }}
      accessibilityLabel="Toggle dark or light timer background"
    >
      <View style={styles.themeSliderTrack}>
        <MaterialCommunityIcons
          name="moon-waning-crescent"
          size={14}
          color="rgba(252,251,249,0.55)"
          style={styles.themeIconMoon}
        />
        <MaterialCommunityIcons
          name="white-balance-sunny"
          size={15}
          color="rgba(252,251,249,0.55)"
          style={styles.themeIconSun}
        />
        <Animated.View
          style={[
            styles.themeThumb,
            colorTheme === 'light' ? styles.themeThumbLight : styles.themeThumbDark,
            { transform: [{ translateX: themeThumbX }] },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  const settingsBtn = (
    <View style={styles.settingsBtnCol}>
      {settingsCancelBtn}
      <TouchableOpacity
        style={[
          styles.settingsBtn,
          {
            borderColor: settingsOpen ? '#FF4D00' : palette.cancelBorder,
            backgroundColor: palette.pillBg,
          },
        ]}
        onPress={toggleSettings}
        activeOpacity={0.7}
      >
        <Text style={[styles.settingsBtnText, { color: settingsOpen ? '#FF4D00' : palette.label }]}>
          SETTINGS
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (!sessionReady) {
    return <SafeAreaView style={[styles.container, { backgroundColor: PALETTE.dark.bg }]} />;
  }

  // ── FAILURE SCREEN ─────────────────────────────────────────────
  if (failed) {
    return (
      <SafeAreaView style={styles.failContainer}>
        <View style={styles.failContent}>
          <View style={styles.failStrikesRow}>
            <Text style={styles.failX}>✕</Text>
            <Text style={styles.failX}>✕</Text>
          </View>
          <Text style={styles.failTitle}>SESSION{'\n'}FAILED.</Text>
          <View style={styles.failDivider} />
          <Text style={styles.failMessage}>
            You left your focus session{'\n'}twice. You didn't stick{'\n'}to your focus.
          </Text>
          <Text style={styles.failSub}>
            Real focus means no distractions.{'\n'}Try again when you're ready.
          </Text>
          <View style={styles.failBtns}>
            <TouchableOpacity style={styles.failRetryBtn} onPress={() => void handleTryAgain()} activeOpacity={0.85}>
              <Text style={styles.failRetryText}>TRY AGAIN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.failExitBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.failExitText}>EXIT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── MAIN TIMER SCREEN ──────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>

      <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity: strikeFlash }]} />

      {banner !== '' && (
        <Animated.View style={[styles.banner, { transform: [{ translateY: bannerY }] }]}>
          <Text style={styles.bannerText}>{banner}</Text>
        </Animated.View>
      )}

      {!landscape ? (
        /* ── PORTRAIT LAYOUT ── */
        <>
      {/* Header — theme toggle top-left, exit top-right */}
      <View style={styles.header}>
        <View style={styles.topLeftStack}>{themeToggle}</View>
        <Text style={[styles.roundLabel, { color: palette.label }]}>
          {isBreak ? '● BREAK' : `ROUND ${round}`}
        </Text>
        <View style={styles.topRightStack}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleExit}
            activeOpacity={0.85}
            accessibilityLabel="Leave timer running"
          >
            <MaterialCommunityIcons name="close" size={32} color="#FCFBF9" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Center content — flex to fill middle */}
      <View style={styles.centerContent}>
        {/* Activity title, phase, and timer — centered */}
        <View style={styles.centerStage}>
          <Text
            style={[styles.focusName]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {isBreak ? 'REST UP.' : focusName}
          </Text>

          <View style={styles.phaseRow}>
            <View style={styles.phasePill}>
              <Text style={[styles.phaseText, { color: phaseLabelColor }]}>
                {isBreak ? 'BREAK' : 'FOCUS'}
              </Text>
            </View>
          </View>

          <View style={styles.timerSection}>
            <Text
              style={[
                styles.timer,
                { color: started ? palette.timer : palette.timerDim },
              ]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {minutes}:{seconds}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: palette.track }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>

        {/* Strike indicators */}
        <View style={styles.strikeRow}>
          {[...Array(STRIKE_LIMIT)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.strikePip,
                { backgroundColor: palette.track, borderColor: palette.trackBorder },
                i < strikes && styles.strikePipUsed,
              ]}
            />
          ))}
          <Text style={[styles.strikeText, { color: palette.label }, strikes > 0 && styles.strikeTextWarn]}>
            {strikes === 0 ? 'NO STRIKES' : strikes === 1 ? '1 STRIKE — LAST WARNING' : '2 STRIKES'}
          </Text>
        </View>

        {/* Accountability line */}
        <Text style={[styles.accountLine, { color: palette.muted }]}>
          {!started
            ? 'KEEP THIS SCREEN OPEN — LEAVE TWICE AND YOU FAIL'
            : strikes > 0
            ? 'STAY ON THIS SCREEN OR YOUR SESSION IS OVER'
            : isBreak
            ? `NEXT: ${Math.round(workSecs / 60)} MIN FOCUS BLOCK`
            : `BREAK AFTER THIS BLOCK`}
        </Text>
      </View>

      {/* Controls — fixed at bottom */}
      <View style={styles.controls}>
        <View style={styles.runControlsCol}>
          {settingsPanel}
          <View style={styles.runControls}>
            {settingsBtn}
            {!started ? (
              <TouchableOpacity
                style={[styles.startBtn, styles.startBtnInline, { borderColor: palette.startBorder }]}
                onPress={handleStart}
                activeOpacity={0.85}
              >
                <Text style={styles.startBtnText}>START SESSION</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.circleBtn, styles.runControlSide]} onPress={handlePause} activeOpacity={0.85}>
                <MaterialCommunityIcons name={running ? 'pause' : 'play'} size={28} color={palette.pauseIcon} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
        </>
      ) : (
        /* ── LANDSCAPE LAYOUT — Split screen ── */
        <View style={styles.landscapeOuter}>
          <View style={styles.landscapeTopBar}>
            <View style={styles.topLeftStack}>{themeToggle}</View>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={handleExit}
              activeOpacity={0.85}
              accessibilityLabel="Leave timer running"
            >
              <MaterialCommunityIcons name="close" size={28} color="#FCFBF9" />
            </TouchableOpacity>
          </View>
          <View style={styles.landscapeContainer}>
          {/* Left: Timer */}
          <View style={styles.landscapeLeft}>
            <Text
              style={[styles.focusName, styles.focusNameLandscape]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {isBreak ? 'REST UP.' : focusName}
            </Text>
            <View style={styles.phasePill}>
              <Text style={[styles.phaseText, { color: phaseLabelColor }]}>
                {isBreak ? 'BREAK' : 'FOCUS'}
              </Text>
            </View>
            <Text
              style={[styles.timer, { color: started ? palette.timer : palette.timerDim }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {minutes}:{seconds}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: palette.track, marginTop: 16 }]}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
          </View>

          {/* Right: Controls */}
          <View style={styles.landscapeRight}>
            <View style={styles.strikeBox}>
              <View style={styles.strikeRow}>
                {[...Array(STRIKE_LIMIT)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.strikePip,
                      { backgroundColor: palette.track, borderColor: palette.trackBorder },
                      i < strikes && styles.strikePipUsed,
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strikeText, { color: palette.label }, strikes > 0 && styles.strikeTextWarn]}>
                {strikes === 0 ? 'NO STRIKES' : strikes === 1 ? '1 STRIKE' : '2 STRIKES'}
              </Text>
            </View>

            <View style={styles.landscapeControlsCol}>
              {settingsPanel}
              <View style={styles.runControls}>
                <View style={styles.settingsBtnCol}>
                  {settingsCancelBtn}
                  <TouchableOpacity
                    style={[
                      styles.settingsBtn,
                      {
                        borderColor: settingsOpen ? '#FF4D00' : palette.cancelBorder,
                        backgroundColor: palette.pillBg,
                      },
                    ]}
                    onPress={toggleSettings}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.settingsBtnText, { color: settingsOpen ? '#FF4D00' : palette.label }]}>
                      SETTINGS
                    </Text>
                  </TouchableOpacity>
                </View>
                {!started ? (
                  <TouchableOpacity
                    style={[styles.startBtn, styles.startBtnInline, styles.runControlSide, { borderColor: palette.startBorder }]}
                    onPress={handleStart}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.startBtnText}>START</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.circleBtn, styles.runControlSide]} onPress={handlePause} activeOpacity={0.85}>
                    <MaterialCommunityIcons name={running ? 'pause' : 'play'} size={28} color={palette.pauseIcon} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF2020',
  },
  banner: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: '#FF4D00',
    paddingVertical: 14,
    paddingHorizontal: 24,
    zIndex: 100,
  },
  bannerText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#FCFBF9',
    letterSpacing: 1,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: THEME_SLIDER_H + 8,
  },
  topLeftStack: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  topRightStack: {
    alignItems: 'center',
  },
  themeSlider: {
    width: THEME_SLIDER_W,
    height: THEME_SLIDER_H,
    borderRadius: THEME_SLIDER_H / 2,
    backgroundColor: '#FF4D00',
    overflow: 'hidden',
  },
  themeSliderTrack: {
    flex: 1,
  },
  themeIconMoon: {
    position: 'absolute',
    left: 7,
    top: (THEME_SLIDER_H - 14) / 2,
  },
  themeIconSun: {
    position: 'absolute',
    right: 6,
    top: (THEME_SLIDER_H - 15) / 2,
  },
  themeThumb: {
    position: 'absolute',
    left: THEME_SLIDER_PAD,
    top: (THEME_SLIDER_H - THEME_THUMB_SIZE) / 2,
    width: THEME_THUMB_SIZE,
    height: THEME_THUMB_SIZE,
    borderRadius: THEME_THUMB_SIZE / 2,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 3,
  },
  themeThumbDark: {
    backgroundColor: '#0D0C0B',
    borderColor: '#2A2826',
  },
  themeThumbLight: {
    backgroundColor: '#FCFBF9',
    borderColor: '#E5E3E0',
  },
  circleBtn: {
    width: CIRCLE_BTN_SIZE,
    height: CIRCLE_BTN_SIZE,
    borderRadius: CIRCLE_BTN_SIZE / 2,
    backgroundColor: '#FF4D00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundLabel: {
    flex: 1,
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    letterSpacing: 2,
    paddingTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  centerStage: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  focusName: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 28,
    color: '#FF4D00',
    letterSpacing: 0,
    textAlign: 'center',
    width: '100%',
    marginBottom: 16,
    lineHeight: 40,
  },
  focusNameLandscape: {
    fontSize: 24,
    marginBottom: 10,
    lineHeight: 32,
  },
  phaseRow: {
    alignItems: 'center',
    marginBottom: 28,
  },
  phasePill: {
    alignSelf: 'center',
    backgroundColor: '#FF4D00',
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  phaseText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 11,
    letterSpacing: 2,
  },
  timerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  timer: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 80,
    letterSpacing: -2,
    textAlign: 'center',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginBottom: 20,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF4D00',
    borderRadius: 2,
  },
  strikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    marginTop: 2,
  },
  strikePip: {
    width: 10, height: 10,
    borderRadius: 2,
    borderWidth: 1,
  },
  strikePipUsed: {
    backgroundColor: '#FF4D00',
    borderColor: '#FF4D00',
  },
  strikeText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    letterSpacing: 1,
  },
  strikeTextWarn: { color: '#FF4D00' },
  accountLine: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 12,
    lineHeight: 16,
  },
  controls: {
    paddingBottom: 12,
    width: '100%',
  },

  // ── START button — clean pixel style, no glow ──────────────────
  startBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderWidth: 2,
    borderRadius: 6,
  },
  startBtnInline: {
    flex: 1,
    height: CIRCLE_BTN_SIZE,
    borderRadius: CIRCLE_BTN_SIZE / 2,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  startBtnText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 11,
    color: '#FF4D00',
    letterSpacing: 2,
  },

  runControlsCol: {
    width: '100%',
    gap: 10,
  },
  runControls: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
    width: '100%',
  },
  runControlSide: {
    flexShrink: 0,
  },
  settingsWrap: {
    width: '100%',
    marginBottom: 4,
  },
  settingsBtnCol: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  settingsCancelTouch: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  settingsCancelText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#E53935',
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  settingsWheelsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  settingsBtn: {
    width: '100%',
    height: CIRCLE_BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: CIRCLE_BTN_SIZE / 2,
  },
  settingsBtnText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  // ── Failure screen ─────────────────────────────────────────────
  failContainer: {
    flex: 1,
    backgroundColor: '#120808',
    paddingHorizontal: 28,
  },
  failContent: {
    flex: 1,
    justifyContent: 'center',
  },
  failStrikesRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  failX: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 36,
    color: '#FF4D00',
  },
  failTitle: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 32,
    color: '#FCFBF9',
    lineHeight: 52,
    marginBottom: 28,
  },
  failDivider: {
    height: 2,
    backgroundColor: '#FF4D00',
    width: 60,
    marginBottom: 28,
  },
  failMessage: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 15,
    color: '#FCFBF9',
    lineHeight: 24,
    marginBottom: 14,
  },
  failSub: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: '#5A5653',
    lineHeight: 20,
    marginBottom: 52,
  },
  failBtns: { gap: 12 },
  failRetryBtn: {
    backgroundColor: '#FF4D00',
    borderRadius: 4,
    paddingVertical: 18,
    alignItems: 'center',
  },
  failRetryText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 11,
    color: '#FCFBF9',
    letterSpacing: 2,
  },
  failExitBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2A2826',
    borderRadius: 4,
  },
  failExitText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    color: '#5A5653',
    letterSpacing: 2,
  },

  // ── LANDSCAPE LAYOUT ────────────────────────────────────────────
  landscapeOuter: {
    flex: 1,
  },
  landscapeTopBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  landscapeContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  landscapeLeft: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 12,
    borderRightWidth: 2,
    borderRightColor: '#FF4D00',
  },
  landscapeRight: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  strikeBox: {
    backgroundColor: 'rgba(255, 77, 0, 0.08)',
    borderWidth: 2,
    borderColor: '#FF4D00',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  landscapeControlsCol: {
    gap: 12,
    flex: 1,
    justifyContent: 'flex-end',
  },
});
