// useState stores values that can change and re-renders the screen when they do.
// useEffect runs code at specific moments — like when the screen first loads.
// useRef holds a value that survives re-renders without causing one (we use it for the scroll wheel).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// useFocusEffect runs when this tab gains focus (e.g. switching back from GYM).
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';

// expo-haptics triggers the phone's vibration motor — used for the tactile "click" as dates scroll.
import * as Haptics from 'expo-haptics';

// NativeSyntheticEvent/NativeScrollEvent are the types describing a scroll event (for TypeScript).
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

// AsyncStorage is the phone's built-in storage — like a tiny database saved on the device.
// We use it to remember tasks between app launches so they load instantly without a network call.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Our Supabase client — used to back up tasks to the cloud database.
import { supabase } from '@/lib/supabase';
import {
  formatSessionRemainingLabel,
  getEffectiveSecsLeft,
  loadActiveFocusSession,
  patchPersistedSessionFocusName,
  type PersistedFocusSession,
} from '@/lib/focus-session';
import {
  DEFAULT_BREAK_MINS,
  DEFAULT_WORK_MINS,
  FOCUS_BLOCKS,
  FOCUS_SETTINGS_KEY,
  focusBlockDisplayLabel,
  parseFocusSettings,
  readFocusSettingsFromSupabase,
  readFocusSettingsLocal,
  saveFocusSettings,
  writeFocusSettingsLocal,
} from '@/lib/focus-settings';

import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Keyboard,
  Animated,
  Easing,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { TaskRow, InsertionGhost } from '@/components/TaskRow';
import { DragTaskFloatingChip } from '@/components/DragTaskFloatingChip';
import { useTaskDragFloat } from '@/lib/task-drag-float';
import {
  TASK_ROW_SLOT_PX,
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_STEP_PX,
  DELETE_ZONE_X,
  COMPLETE_HOLD_MS,
  COMPLETE_FADE_MS,
  LIST_MOVE_SPRING_MS,
  listMoveSpring,
  listMoveSpringDown,
  smoothListAnim,
  sortActiveTasks,
  completedTaskSinkIndex,
  insertNewActiveTask,
  buildTaskList,
  type Priority,
  type Task,
  type TaskMap,
} from '@/lib/tasks-core';

// Enable LayoutAnimation on Android (iOS enables it automatically).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// SafeAreaView automatically adds padding so content isn't hidden behind the camera notch
// or the home bar at the bottom of the phone.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// A library of icons. We use it for the step, clock, fire, and mountain icons in the tracker bar.
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Full names of the days of the week, used to display the day name on each date card.
const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// Full names of the months, used to display the month name on the selected date card.
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

// How many days of history to show before today, and how many days ahead.
const PAST_DAYS = 30;
const FUTURE_DAYS = 120;

// Builds the array of date objects, running from PAST_DAYS before today to FUTURE_DAYS after.
// Each object has a unique key (used as an ID + task lookup), the day name, date number, and month.
// Returns the list plus the index of today, so the wheel can start centred on the current day.
function buildDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);                 // Ignore the time of day — we only care about the date.

  const start = new Date(today);
  start.setDate(today.getDate() - PAST_DAYS); // Begin a month before today.

  const total = PAST_DAYS + 1 + FUTURE_DAYS;  // past days + today + future days.
  const out = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      // The key is a unique string like "2026-5-1" used to look up tasks for that day.
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      day: DAY_NAMES[d.getDay()],
      date: String(d.getDate()).padStart(2, '0'), // e.g. "01", "15"
      month: MONTH_NAMES[d.getMonth()],
    });
  }
  return out;
}

// Build the list of dates once at startup. This never changes while the app is running.
const DATES = buildDates();

// The index of TODAY in the list — it's always PAST_DAYS in (we put 30 days of history first).
// The wheel starts centred here, and the task list opens on today.
const TODAY_INDEX = PAST_DAYS;

// ── Date wheel sizing ──────────────────────────────────────────────
// VISIBLE: how many date rows show at once (odd, so one sits dead-centre).
// The actual row height is measured at runtime so 3 big dates fill the whole column —
// see the `itemH` state and the wheel's onLayout handler below.
const VISIBLE = 3;
function normalizeTaskMap(map: TaskMap): TaskMap {
  const out: TaskMap = {};
  for (const key of Object.keys(map)) {
    const dayTasks = map[key] ?? [];
    const active = dayTasks.filter(t => !t.archived);
    const archived = dayTasks.filter(t => t.archived);
    out[key] = [...sortActiveTasks(active), ...archived];
  }
  return out;
}

// Generates a random UUID (universally unique ID) in the standard format.
// We use this as the task's ID — it's the same ID stored both locally and in Supabase,
// so we can match them up when syncing (e.g. to update or delete the right row).
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Format a date number with its ordinal suffix (1st, 2nd, 3rd, 21st, etc.)
function formatOrdinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}TH`;
  const lastDigit = day % 10;
  if (lastDigit === 1) return `${day}ST`;
  if (lastDigit === 2) return `${day}ND`;
  if (lastDigit === 3) return `${day}RD`;
  return `${day}TH`;
}

// Static data for the tracker bar at the bottom of the screen.
// These are placeholder values — real step/calorie data would come from the phone's health APIs.
const TRACKERS = [
  { icon: 'shoe-print',       top: "TODAY'S STEPS", value: '16,842', unit: 'STEPS' },
  { icon: 'clock-outline',    top: 'ACTIVE TIME',   value: '2:14',   unit: 'HRS'   },
  { icon: 'fire',             top: 'CALORIES',       value: '1,126',  unit: 'KCAL'  },
  { icon: 'image-filter-hdr', top: 'ELEVATION',      value: '612',    unit: 'M'     },
] as const;

// The main screen component for the TODAY tab.
export default function TodayScreen() {

  // The date key of the currently selected date card (e.g. "2026-5-1").
  // Starts on TODAY so the app opens on the current day.
  const [selectedKey, setSelectedKey] = useState(DATES[TODAY_INDEX].key);

  // All tasks for all dates, stored as a dictionary keyed by date string.
  // Starts empty — tasks are loaded from AsyncStorage when the screen mounts.
  const [taskMap, setTaskMap] = useState<TaskMap>({});

  // ── Focus block state ─────────────────────────────────────────────
  const [focusName, setFocusName]         = useState('');
  const [focusBlockIdx, setFocusBlockIdx] = useState(3);
  const [focusWorkMins, setFocusWorkMins] = useState(DEFAULT_WORK_MINS);
  const [focusBreakMins, setFocusBreakMins] = useState(DEFAULT_BREAK_MINS);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | null>(null);
  const [activeSessionRunning, setActiveSessionRunning] = useState(false);
  const activeSessionRef = useRef<PersistedFocusSession | null>(null);
  const FOCUS_SESSION_TICK_MS = 100;
  const FOCUS_SESSION_SYNC_MS = 2000;
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  // Drag refs — stable handlers for RNGH pan gestures (long-press then drag).
  const draggingTaskIdRef  = useRef<string | null>(null);   // mirrors draggingTaskId state
  const { floatTop, floatLeft, startFloat, moveFloat, syncColumnLeft, setOverlayOrigin } =
    useTaskDragFloat();
  const overDeleteRef      = useRef(false);
  const [overDelete, setOverDelete] = useState(false);
  // taskMapRef / selectedKeyRef / userIdRef — stable copies so the PanResponder's
  // closures never go stale when state changes during a drag.
  const taskMapRef     = useRef<TaskMap>({});
  const selectedKeyRef2 = useRef('');
  const userIdRef2     = useRef<string | null>(null);
  // Y coordinate of the top of the first task row, measured via onLayout.
  const taskListTopRef   = useRef(0);
  const firstTaskWindowYRef = useRef(0);
  const dragStartIdxRef  = useRef(0);
  const handleDragMoveRef = useRef((_x: number, _y: number) => {});
  const handleDragEndRef  = useRef((_taskId: string) => {});
  const beginTaskDragRef  = useRef((_id: string, _idx: number, _x: number, _y: number, _rowY: number) => {});
  const toggleTaskRef     = useRef((_id: string) => {});
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const [completingPins, setCompletingPins] = useState<Map<string, number>>(() => new Map());
  const completingIdsRef = useRef(completingIds);
  const completeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // The slot index where the task would land right now — drives the insertion line.
  const [dragTargetIdx, setDragTargetIdx] = useState<number | null>(null);
  const dragTargetIdxRef = useRef<number | null>(null);
  // Width and left-edge X of the tasks column — floating chip snaps to column, not finger.
  const [taskColWidth, setTaskColWidth] = useState(200);
  const taskColLeftRef = useRef(153); // absolute screen X; measured in onLayout
  const tasksScrollRef = useRef<GHScrollView>(null);
  const tasksScrollYRef = useRef(0);
  const tasksScrollWindowRef = useRef({ top: 0, bottom: 0 });
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollDirRef = useRef<'up' | 'down' | null>(null);
  const updateAutoScrollRef = useRef((_fingerY: number) => {});
  const stopAutoScrollRef = useRef(() => {});
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Bottom sheet (shared by "Set focus" and "Add task") ───────────
  // sheetMode is null when closed, 'focus' when setting the focus name, 'task' when adding a task.
  const [sheetMode,     setSheetMode]     = useState<'focus' | 'task' | null>(null);
  const [sheetText,     setSheetText]     = useState('');
  const [sheetPriority, setSheetPriority] = useState<Priority>('MEDIUM');
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible

  const sheetEaseOut = Easing.bezier(0.22, 1, 0.36, 1);
  const sheetEaseIn = Easing.bezier(0.4, 0, 0.2, 1);

  function openSheet(mode: 'focus' | 'task') {
    setSheetText(mode === 'focus' ? focusName : '');
    setSheetPriority('MEDIUM');
    setSheetMode(mode);
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 280,
      easing: sheetEaseOut,
      useNativeDriver: true,
    }).start();
  }

  function closeSheet() {
    Keyboard.dismiss();
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 220,
      easing: sheetEaseIn,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSheetMode(null);
    });
  }

  const sheetBackdropOpacity = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const tickActiveSessionLabel = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session) return;
    setActiveSessionLabel(
      formatSessionRemainingLabel(getEffectiveSecsLeft(session), session.phase),
    );
  }, []);

  const refreshFocusSessionPreview = useCallback(async () => {
    const settings = await readFocusSettingsLocal();
    if (settings) {
      setFocusWorkMins(settings.workMins);
      setFocusBreakMins(settings.breakMins);
      setFocusBlockIdx(settings.blockIdx);
    }

    const session = await loadActiveFocusSession();
    activeSessionRef.current = session;
    if (!session) {
      setHasSavedSession(false);
      setActiveSessionLabel(null);
      setActiveSessionRunning(false);
      return;
    }
    setHasSavedSession(true);
    setActiveSessionRunning(session.running);
    setFocusWorkMins(Math.round(session.workSecs / 60));
    setFocusBreakMins(Math.round(session.breakSecs / 60));
    tickActiveSessionLabel();
  }, [tickActiveSessionLabel]);

  function applyFocusSettings(name: string, blockIdx: number) {
    const block = FOCUS_BLOCKS[blockIdx] ?? FOCUS_BLOCKS[3];
    setFocusName(name);
    setFocusBlockIdx(blockIdx);
    setFocusWorkMins(block.minutes);
    setFocusBreakMins(block.breakMins);
    saveFocusSettings(
      { name, blockIdx, workMins: block.minutes, breakMins: block.breakMins },
      userId,
    );
    if (name.trim()) {
      patchPersistedSessionFocusName(name);
    }
  }

  function clearFocusSettings() {
    applyFocusSettings('', focusBlockIdx);
  }

  function confirmSheet() {
    const text = sheetText.trim();
    if (sheetMode === 'focus') {
      if (!text) clearFocusSettings();
      else applyFocusSettings(text, focusBlockIdx);
      closeSheet();
      return;
    }
    if (!text) { closeSheet(); return; }
    if (sheetMode === 'task') addTask(text, sheetPriority);
    closeSheet();
  }

  // The Supabase user ID of the logged-in user.
  // Needed when inserting tasks into Supabase so we know who they belong to.
  const [userId, setUserId] = useState<string | null>(null);

  // Keep drag refs in sync with their corresponding state/values so the stable
  // PanResponder can read current values without stale closures.
  useEffect(() => { draggingTaskIdRef.current = draggingTaskId; }, [draggingTaskId]);
  useEffect(() => { taskMapRef.current        = taskMap;        }, [taskMap]);
  useEffect(() => { selectedKeyRef2.current   = selectedKey;   }, [selectedKey]);
  useEffect(() => {
    completingIdsRef.current = completingIds;
  }, [completingIds]);

  useEffect(() => {
    completeTimersRef.current.forEach(t => clearTimeout(t));
    completeTimersRef.current.clear();
    setCompletingIds(new Set());
    setCompletingPins(new Map());
  }, [selectedKey]);

  useEffect(() => () => {
    completeTimersRef.current.forEach(t => clearTimeout(t));
    completeTimersRef.current.clear();
  }, []);
  useEffect(() => { userIdRef2.current        = userId;        }, [userId]);

  const measureTasksScroll = useCallback(() => {
    tasksScrollRef.current?.measureInWindow((_x, y, _w, h) => {
      tasksScrollWindowRef.current = { top: y, bottom: y + h };
    });
  }, []);

  useEffect(() => {
    stopAutoScrollRef.current = () => {
      if (autoScrollRafRef.current != null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      autoScrollDirRef.current = null;
    };

    const startAutoScroll = (dir: 'up' | 'down') => {
      if (autoScrollDirRef.current === dir) return;
      stopAutoScrollRef.current();
      autoScrollDirRef.current = dir;
      const tick = () => {
        if (!draggingTaskIdRef.current || autoScrollDirRef.current !== dir) return;
        const step = dir === 'down' ? AUTO_SCROLL_STEP_PX : -AUTO_SCROLL_STEP_PX;
        const next = Math.max(0, tasksScrollYRef.current + step);
        tasksScrollYRef.current = next;
        tasksScrollRef.current?.scrollTo({ y: next, animated: false });
        autoScrollRafRef.current = requestAnimationFrame(tick);
      };
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };

    updateAutoScrollRef.current = (fingerY: number) => {
      if (!draggingTaskIdRef.current) {
        stopAutoScrollRef.current();
        return;
      }
      const { top, bottom } = tasksScrollWindowRef.current;
      if (bottom <= top) return;
      if (fingerY > bottom - AUTO_SCROLL_EDGE_PX) startAutoScroll('down');
      else if (fingerY < top + AUTO_SCROLL_EDGE_PX) startAutoScroll('up');
      else stopAutoScrollRef.current();
    };
  }, []);

  useEffect(() => {
    if (draggingTaskId) measureTasksScroll();
    else stopAutoScrollRef.current();
  }, [draggingTaskId, measureTasksScroll]);

  // A direct reference to the scroll wheel, so we can programmatically scroll it
  // (e.g. when the user taps a date instead of dragging).
  const wheelRef = useRef<any>(null);

  // The live scroll position as an Animated value. This drives the white-text overlay so its
  // colour change tracks the orange square pixel-for-pixel, on the native thread (very smooth).
  const scrollY = useRef(new Animated.Value(0)).current;

  // Remembers which date index was last centred. We only update the selection (and fire a
  // haptic tick) when the centred date actually CHANGES — not on every pixel of scrolling.
  // Starts at TODAY_INDEX so the initial position on today doesn't fire a stray haptic.
  const lastIndexRef = useRef(TODAY_INDEX);

  // True only while the USER is dragging/flinging the wheel. We use this to fire haptics ONLY
  // for real finger scrolls — never for programmatic centring (launch / returning to the tab).
  const userScrollingRef = useRef(false);

  // The measured height of one date row. Set from the wheel's real height ÷ VISIBLE so that
  // exactly 3 big dates fill the column. Starts at 0 (unknown) until the column is measured.
  // The wheel itself isn't rendered until this is known, so it can start parked on today.
  const [itemH, setItemH] = useState(0);
  // Top offset of the orange band — centered in the column (avoids drift from floor division).
  const [wheelBandTop, setWheelBandTop] = useState(0);

  // The wheel stays invisible until first layout, then appears on the selected date.
  const [wheelReady, setWheelReady] = useState(false);
  const wheelInitializedRef = useRef(false);
  const itemHRef = useRef(itemH);
  itemHRef.current = itemH;
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;

  // The blank padding above the first / below the last date, so they can reach the centre slot.
  const spacer = wheelBandTop;

  // The index of the currently centred date (used to colour past vs upcoming dates differently).
  const selectedIndex = DATES.findIndex(d => d.key === selectedKey);
  const todayDateKey = DATES[TODAY_INDEX].key;
  const showTodayLabel = selectedKey === todayDateKey;

  // Sync wheel + overlay to a date index without animation (not a user scroll).
  function centerOnIndex(index: number) {
    const h = itemHRef.current;
    if (h <= 0) return;
    const safe = Math.max(0, Math.min(DATES.length - 1, index));
    const y = safe * h;
    userScrollingRef.current = false;
    scrollY.setValue(y);
    lastIndexRef.current = safe;
    wheelRef.current?.scrollTo({ y, animated: false });
  }

  // Reset to today when leaving this tab and coming back — not on layout remeasure while staying here.
  // If the calendar passed a date key, jump to it; otherwise reset to today.
  const { selectDate } = useLocalSearchParams<{ selectDate?: string }>();

  useFocusEffect(
    useCallback(() => {
      let targetIndex = TODAY_INDEX;
      if (selectDate) {
        const found = DATES.findIndex(d => d.key === selectDate);
        if (found >= 0) targetIndex = found;
      }
      const targetKey = DATES[targetIndex].key;
      setSelectedKey(targetKey);
      selectedKeyRef.current = targetKey;
      lastIndexRef.current = targetIndex;
      if (itemHRef.current > 0) {
        centerOnIndex(targetIndex);
      }

      refreshFocusSessionPreview();
    }, [selectDate, refreshFocusSessionPreview])
  );

  useEffect(() => {
    if (!hasSavedSession) return;
    const id = setInterval(tickActiveSessionLabel, FOCUS_SESSION_TICK_MS);
    return () => clearInterval(id);
  }, [hasSavedSession, tickActiveSessionLabel]);

  useEffect(() => {
    if (!hasSavedSession) return;
    const id = setInterval(() => {
      void refreshFocusSessionPreview();
    }, FOCUS_SESSION_SYNC_MS);
    return () => clearInterval(id);
  }, [hasSavedSession, refreshFocusSessionPreview]);

  // One-time bootstrap after row height is measured — opens on today on first launch.
  useEffect(() => {
    if (itemH > 0 && !wheelInitializedRef.current) {
      wheelInitializedRef.current = true;
      centerOnIndex(TODAY_INDEX);
      setWheelReady(true);
    }
  }, [itemH]);

  // Runs as the wheel scrolls. Works out which date is currently in the centre slot,
  // and if it's a new one, selects it (task list updates live) and fires a haptic tick.
  function onWheelScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (itemH <= 0) return;                           // Not measured yet — nothing to compute.
    const y = e.nativeEvent.contentOffset.y;          // How far we've scrolled, in pixels.
    let index = Math.round(y / itemH);                // The nearest date row to the centre.
    if (index < 0) index = 0;                         // Clamp so we never go out of bounds.
    if (index > DATES.length - 1) index = DATES.length - 1;

    if (index !== lastIndexRef.current) {             // Only act when the centred date changes.
      lastIndexRef.current = index;
      setSelectedKey(DATES[index].key);               // Update selection → task list updates instantly.

      // Only tick for real finger scrolls — not for the programmatic jump-to-today on launch.
      // selectionAsync is the exact haptic Apple uses for its pickers — a crisp, light tick
      // that's designed to fire in rapid succession without being dropped, even on fast spins.
      if (userScrollingRef.current) Haptics.selectionAsync();
    }
  }

  // Feeds the scroll position into both `scrollY` (drives the smooth white-text overlay, native
  // thread) and our onWheelScroll listener (handles selection + haptics on the JS thread).
  const onScrollEvent = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true, listener: onWheelScroll }
  );

  // Runs once when the screen first loads.
  // Loads tasks from AsyncStorage (instant) and gets the user's ID from Supabase.
  // If AsyncStorage is empty (first time after switching storage methods), fetches from Supabase instead.
  useEffect(() => {
    const init = async () => {
      // Run both lookups at the same time to save time (Promise.all runs them in parallel).
      const [raw, focusRaw, { data: { session } }] = await Promise.all([
        AsyncStorage.getItem('@tasks'),
        AsyncStorage.getItem(FOCUS_SETTINGS_KEY),
        supabase.auth.getSession(),
      ]);

      const uid = session?.user?.id ?? null;
      setUserId(uid);

      const localFocus = parseFocusSettings(focusRaw);
      if (localFocus) {
        setFocusName(localFocus.name);
        setFocusBlockIdx(localFocus.blockIdx);
        setFocusWorkMins(localFocus.workMins);
        setFocusBreakMins(localFocus.breakMins);
      } else if (uid) {
        const remote = await readFocusSettingsFromSupabase(uid);
        if (remote) {
          setFocusName(remote.name);
          setFocusBlockIdx(remote.blockIdx);
          setFocusWorkMins(remote.workMins);
          setFocusBreakMins(remote.breakMins);
          await writeFocusSettingsLocal(remote);
        }
      }

      if (raw) {
        // Tasks exist in AsyncStorage — parse the JSON string back into an object and use it.
        // This is the fast path: no network request needed.
        setTaskMap(normalizeTaskMap(JSON.parse(raw)));
        return;
      }

      // AsyncStorage was empty — this happens the first time after a fresh install,
      // or after we switched from Supabase-only storage to local-first storage.
      // Pull all tasks from Supabase and save them to AsyncStorage for future launches.
      if (!uid) return; // If there's no user, there's nothing to fetch.

      const { data } = await supabase
        .from('tasks')
        .select('id, label, done, date, archived')  // Fetch these columns (including archived) from the tasks table.
        .eq('user_id', uid)               // Only fetch tasks belonging to this user.
        .order('created_at', { ascending: true }); // Oldest tasks first.

      if (data && data.length > 0) {
        // Group the flat list of tasks by their date key, building a TaskMap.
        // We keep archived tasks here too — they're filtered out of the visible list below.
        const seeded: TaskMap = {};
        for (const row of data) {
          if (!seeded[row.date]) seeded[row.date] = []; // Create the array for this date if needed.
          seeded[row.date].push({ id: row.id, label: row.label, done: row.done, archived: row.archived });
        }
        const normalized = normalizeTaskMap(seeded);
        setTaskMap(normalized);
        // Save to AsyncStorage so next launch is instant.
        AsyncStorage.setItem('@tasks', JSON.stringify(normalized));
      }
    };
    init();
  }, []); // The empty array [] means: only run this once, when the component first mounts.

  // ALL tasks stored for the selected date — including archived ones.
  // We use this version when SAVING changes, so archived tasks aren't accidentally lost.
  const allTasks = taskMap[selectedKey] ?? [];

  const activeTasks = allTasks.filter(t => !t.archived);

  // Incomplete always above done; completing tasks stay pinned until the slide finishes.
  const tasks = useMemo(() => {
    const active = (taskMap[selectedKey] ?? []).filter(t => !t.archived);
    return buildTaskList(active, completingIds, completingPins);
  }, [taskMap, selectedKey, completingIds, completingPins]);

  // The task currently being dragged (used to label the floating box). null when not dragging.
  const draggingTask = tasks.find(t => t.id === draggingTaskId) ?? null;

  // Saves a new version of the task map both in memory (instant UI update)
  // and to AsyncStorage (so it survives app restarts).
  function persist(newMap: TaskMap) {
    setTaskMap(newMap);                                         // Update the UI immediately.
    AsyncStorage.setItem('@tasks', JSON.stringify(newMap));    // Save to the device in the background.
  }

  function removeCompletingState(id: string) {
    setCompletingIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCompletingPins(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  // Flips a task between done and not done. Completing: hold → fade label → slide to bottom.
  function toggleTask(id: string) {
    const task = allTasks.find(t => t.id === id);
    if (!task || task.archived || completingIds.has(id)) return;
    const newDone = !task.done;

    const archivedTasks = allTasks.filter(t => t.archived);
    const updatedActive = activeTasks.map(t =>
      t.id === id ? { ...t, done: newDone } : t,
    );

    if (newDone) {
      const pinIdx = tasks.findIndex(t => t.id === id);
      const newMap = {
        ...taskMap,
        [selectedKey]: [...updatedActive, ...archivedTasks],
      };
      persist(newMap);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setCompletingIds(prev => new Set(prev).add(id));
      setCompletingPins(prev => new Map(prev).set(id, pinIdx >= 0 ? pinIdx : updatedActive.length));
      clearCompletionTimer(id);
      const timer = setTimeout(
        () => finishTaskCompletion(id),
        COMPLETE_HOLD_MS + COMPLETE_FADE_MS,
      );
      completeTimersRef.current.set(id, timer);
    } else {
      clearCompletionTimer(id);
      removeCompletingState(id);
      LayoutAnimation.configureNext(listMoveSpring);
      const reordered = sortActiveTasks(updatedActive);
      const newMap = {
        ...taskMap,
        [selectedKey]: [...reordered, ...archivedTasks],
      };
      persist(newMap);
    }

    supabase.from('tasks').update({ done: newDone }).eq('id', id).then(() => {});
  }

  // Creates a new task for the currently selected date.
  function addTask(label: string, priority: Priority) {
    const id = generateId();          // Create a unique ID for this task.

    const archivedTasks = allTasks.filter(t => t.archived);
    const active = allTasks.filter(t => !t.archived);
    const newMap = {
      ...taskMap,
      [selectedKey]: [
        ...insertNewActiveTask(active, { id, label, done: false, archived: false, priority }),
        ...archivedTasks,
      ],
    };
    persist(newMap);

    if (userId) supabase.from('tasks').insert({ id, user_id: userId, date: selectedKey, label, done: false, priority }).then(() => {});
  }

  // Archives a task: hides it from the active list but keeps it forever
  // (on the device AND in the cloud) so it can be shown in a history screen later.
  function archiveTask(id: string) {
    // Build a new task map where the matching task is marked archived (not removed).
    const newMap = {
      ...taskMap,
      [selectedKey]: allTasks.map(t =>
        t.id === id ? { ...t, archived: true } : t // Flag it instead of deleting it.
      ),
    };
    persist(newMap); // Save locally.

    // Also mark it archived in Supabase in the background — we UPDATE the row, never delete it.
    // If Supabase blocks or fails the update, we log a warning to the terminal.
    supabase.from('tasks').update({ archived: true }).eq('id', id).then(({ error }) => {
      if (error) console.warn('[archive task] Supabase rejected the update:', error.message);
    });
  }

  // Moves an active (not archived) task to a specific index in today's order.
  function moveTaskToIndex(id: string, targetIndex: number) {
    const activeTasks = allTasks.filter(t => !t.archived);
    const archivedTasks = allTasks.filter(t => t.archived);
    const from = activeTasks.findIndex(t => t.id === id);
    if (from < 0) return;
    if (targetIndex < 0 || targetIndex >= activeTasks.length) return;
    if (from === targetIndex) return;
    const reordered = [...activeTasks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIndex, 0, moved);

    const sorted = sortActiveTasks(reordered);
    const newMap = {
      ...taskMap,
      [selectedKey]: [...sorted, ...archivedTasks],
    };
    persist(newMap);
  }

  function clearCompletionTimer(id: string) {
    const t = completeTimersRef.current.get(id);
    if (t) clearTimeout(t);
    completeTimersRef.current.delete(id);
  }

  function finishTaskCompletion(id: string) {
    clearCompletionTimer(id);

    const key = selectedKeyRef2.current;
    const all = taskMapRef.current[key] ?? [];
    const archivedTasks = all.filter(t => t.archived);
    const active = all.filter(t => !t.archived);
    const sinkIndex = completedTaskSinkIndex(active);

    LayoutAnimation.configureNext(listMoveSpringDown);
    setCompletingPins(prev => new Map(prev).set(id, sinkIndex));

    completeTimersRef.current.set(
      id,
      setTimeout(() => {
        LayoutAnimation.configureNext(listMoveSpring);
        removeCompletingState(id);
        persist({
          ...taskMapRef.current,
          [key]: [...sortActiveTasks(active), ...archivedTasks],
        });
        completeTimersRef.current.delete(id);
      }, LIST_MOVE_SPRING_MS),
    );
  }

  function computeDropIndexFromFinger(fingerPageY: number, activeCount: number) {
    const firstY = firstTaskWindowYRef.current;
    if (firstY <= 0) return dragStartIdxRef.current;
    const rel = fingerPageY - firstY + tasksScrollYRef.current;
    const slot = Math.floor((rel + TASK_ROW_SLOT_PX / 2) / TASK_ROW_SLOT_PX);
    return Math.max(0, Math.min(activeCount, slot));
  }

  function beginTaskDrag(
    taskId: string,
    taskIndex: number,
    _pageX: number,
    pageY: number,
    rowWinY: number,
  ) {
    if (draggingTaskIdRef.current) return;
    draggingTaskIdRef.current = taskId;
    dragStartIdxRef.current = taskIndex;
    dragTargetIdxRef.current = taskIndex;
    setDragTargetIdx(taskIndex);
    startFloat(rowWinY, taskColLeftRef.current, pageY);
    setDraggingTaskId(taskId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  // Stable endDrag — reads from refs so drag handlers can call it safely.
  const endDragRef = useRef((taskId: string) => {
    stopAutoScrollRef.current();
    if (overDeleteRef.current) {
      const currentMap = taskMapRef.current;
      const key = selectedKeyRef2.current;
      const all = currentMap[key] ?? [];
      const newMap = { ...currentMap, [key]: all.map(t => t.id === taskId ? { ...t, archived: true } : t) };
      setTaskMap(newMap);
      AsyncStorage.setItem('@tasks', JSON.stringify(newMap));
      const uid = userIdRef2.current;
      if (uid) supabase.from('tasks').update({ archived: true }).eq('id', taskId).then(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const target = dragTargetIdxRef.current;
      if (target !== null) {
        const key = selectedKeyRef2.current;
        const active = (taskMapRef.current[key] ?? []).filter(t => !t.archived);
        const from = active.findIndex(t => t.id === taskId);
        const to =
          target >= active.length ? active.length - 1 : Math.min(target, active.length - 1);
        if (from >= 0 && from !== to) {
          LayoutAnimation.configureNext(smoothListAnim);
          moveTaskRef.current(taskId, to);
        }
      }
    }
    overDeleteRef.current = false;
    dragTargetIdxRef.current = null;
    setOverDelete(false);
    setDragTargetIdx(null);
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
  });

  useEffect(() => {
    beginTaskDragRef.current = beginTaskDrag;
    toggleTaskRef.current = toggleTask;

    handleDragMoveRef.current = (pageX: number, pageY: number) => {
      const taskId = draggingTaskIdRef.current;
      if (!taskId) return;

      moveFloat(pageY);
      syncColumnLeft(taskColLeftRef.current);
      updateAutoScrollRef.current(pageY);

      const inDelete = pageX < DELETE_ZONE_X;
      if (inDelete !== overDeleteRef.current) {
        overDeleteRef.current = inDelete;
        setOverDelete(inDelete);
        Haptics.impactAsync(
          inDelete ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
        );
      }

      if (!inDelete) {
        const key = selectedKeyRef2.current;
        const active = (taskMapRef.current[key] ?? []).filter(t => !t.archived);
        const target = computeDropIndexFromFinger(pageY, active.length);
        if (target !== dragTargetIdxRef.current) {
          dragTargetIdxRef.current = target;
          setDragTargetIdx(target);
        }
      } else if (dragTargetIdxRef.current !== null) {
        dragTargetIdxRef.current = null;
        setDragTargetIdx(null);
      }
    };

    handleDragEndRef.current = (taskId: string) => {
      if (draggingTaskIdRef.current === taskId) endDragRef.current(taskId);
    };
  });

  // Stable moveTaskToIndex — also reads from refs.
  const moveTaskRef = useRef((taskId: string, targetIndex: number) => {
    const currentMap = taskMapRef.current;
    const key = selectedKeyRef2.current;
    const all = currentMap[key] ?? [];
    const active = all.filter(t => !t.archived);
    const archived = all.filter(t => t.archived);
    const from = active.findIndex(t => t.id === taskId);
    // Clamp: dragTargetIdx can be activeCount (for the "after last" line), cap it to activeCount-1.
    const clampedTarget = Math.min(targetIndex, active.length - 1);
    if (from < 0 || clampedTarget < 0 || clampedTarget >= active.length || from === clampedTarget) return;
    const reordered = [...active];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(clampedTarget, 0, moved);
    const newMap = { ...currentMap, [key]: [...sortActiveTasks(reordered), ...archived] };
    setTaskMap(newMap);
    AsyncStorage.setItem('@tasks', JSON.stringify(newMap));
  });

  return (
    // SafeAreaView adds padding at the top so content isn't hidden behind the camera notch.
    // edges={['top']} means we only apply this padding at the top (not the bottom — the tab bar handles that).
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        {/* The "TODAY" title with decorative orange corner lines + logout button. */}
        <View style={styles.titleWrap}>
          <View style={[styles.corner, styles.cornerTL]} />{/* Top-left orange corner line. */}
          <Text style={styles.title}>TODAY</Text>
          <TouchableOpacity
            onPress={() => router.push('/calendar')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#FF4D00" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await supabase.auth.signOut();
              router.replace('/(auth)/login');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="logout" size={18} color="#FF4D00" />
          </TouchableOpacity>
          <View style={[styles.corner, styles.cornerBR]} />{/* Bottom-right orange corner line. */}
        </View>
        <Text style={styles.tagline}>PLAN. TRACK. EXECUTE.</Text>
      </View>

      {/* ── Main body: date column + task list ─────────── */}
      {/* This row takes up all remaining space (flex: 1) between the header and tracker bar. */}
      <View style={styles.row}>

        {/* Left column — same fixed-width slot always. Contents swap based on drag state. */}
        <View
          style={[styles.wheelWrap, draggingTaskId ? styles.deleteBinCol : { opacity: wheelReady ? 1 : 0 }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            const next = Math.floor(h / VISIBLE);
            const bandTop = Math.round((h - next) / 2);
            if (next > 0 && (next !== itemH || bandTop !== wheelBandTop)) {
              const index = DATES.findIndex(d => d.key === selectedKeyRef.current);
              const safe = index >= 0 ? index : TODAY_INDEX;
              setItemH(next);
              setWheelBandTop(bandTop);
              scrollY.setValue(safe * next);
              if (wheelInitializedRef.current) {
                requestAnimationFrame(() => {
                  wheelRef.current?.scrollTo({ y: safe * next, animated: false });
                });
              }
            }
          }}
        >
          {/* While dragging, show the delete bin instead of the date wheel. */}
          {draggingTaskId ? (
            <>
              <MaterialCommunityIcons
                name={overDelete ? 'trash-can' : 'trash-can-outline'}
                size={48}
                color={overDelete ? '#FCFBF9' : '#FF4D00'}
              />
              <Text style={[styles.deleteBinLabel, overDelete && styles.deleteBinLabelActive]}>
                {overDelete ? 'RELEASE\nTO\nDELETE' : 'DRAG\nHERE\nTO\nDELETE'}
              </Text>
            </>
          ) : null}

          {/* Only render the wheel once we know the row height, so it can start already parked
              on today (via contentOffset) instead of visibly scrolling there after launch. */}
          {!draggingTaskId && itemH > 0 && (
            <>
          {/* LAYER 1 (bottom): the scrollable list of dates in their DARK appearance.
              This is the real scroll view — it owns the scrolling, snapping and tap targets. */}
          <Animated.ScrollView
            ref={wheelRef}
            style={styles.wheel}
            showsVerticalScrollIndicator={false}
            snapToInterval={itemH}            // Snaps so a date always lands dead-centre.
            decelerationRate="normal"         // Long, glassy momentum — a fling keeps rolling.
            scrollEventThrottle={1}           // Fire on (almost) every frame so no tick is missed.
            onScroll={onScrollEvent}          // Drives the overlay (native) + selection/haptic (JS).
            onScrollBeginDrag={() => { userScrollingRef.current = true; }}    // Real finger scroll → allow ticks.
            onMomentumScrollEnd={() => { userScrollingRef.current = false; }} // Settled → stop ticking.
            contentOffset={{ x: 0, y: TODAY_INDEX * itemH }}                  // Start parked on today.
            contentContainerStyle={{ paddingVertical: spacer }}
          >
            {DATES.map((d, i) => {
              // All dates are black (solid text on both past and upcoming).
              // (The white version lives in the overlay layer below, clipped to the orange square.)
              const color = '#1A1714';
              const pending = (taskMap[d.key] ?? []).filter(t => !t.done && !t.archived).length;

              return (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.wheelItem, { height: itemH }]}
                  activeOpacity={0.8}
                  onPress={() => wheelRef.current?.scrollTo({ y: i * itemH, animated: true })}
                >
                  {showTodayLabel && d.key === todayDateKey && (
                    <Text style={[styles.wheelTodayLabel, { color }]}>TODAY</Text>
                  )}
                  <Text style={[styles.wheelDay, { color }]}>{d.day}</Text>
                  <Text style={[styles.wheelNum, { color }]}>{d.date}</Text>
                  {pending > 0 && (
                    <View style={[styles.badge, { backgroundColor: '#FF4D00' }]}>
                      <Text style={[styles.badgeText, { color: '#FCFBF9' }]}>{pending}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </Animated.ScrollView>

          {/* LAYER 2 (top): the orange square. It is CLIPPED to the centre slot (overflow hidden),
              and holds a second copy of the dates in WHITE. We slide that copy by -scrollY so it
              lines up exactly with the layer below — so only the part of a number that's actually
              over the orange square appears white. pointerEvents none lets touches reach layer 1. */}
          <View style={[styles.bandClip, { top: wheelBandTop, height: itemH }]} pointerEvents="none">
            <Animated.View style={{ transform: [{ translateY: Animated.multiply(scrollY, -1) }] }}>
              {DATES.map((d, i) => {
                const pending = (taskMap[d.key] ?? []).filter(t => !t.done && !t.archived).length;
                return (
                  <View key={d.key} style={[styles.wheelItem, { height: itemH }]}>
                    {showTodayLabel && d.key === todayDateKey && (
                      <Text style={styles.wheelTodayLabel}>TODAY</Text>
                    )}
                    <Text style={[styles.wheelDay, { color: '#FCFBF9' }]}>{d.day}</Text>
                    <Text style={[styles.wheelNum, { color: '#FCFBF9' }]}>{d.date}</Text>
                    {/* Month only in overlay — absolute so day/number stay aligned with layer below. */}
                    <Text style={styles.wheelMonth}>{d.month}</Text>
                    {pending > 0 && (
                      <View style={[styles.badge, { backgroundColor: '#FCFBF9' }]}>
                        <Text style={[styles.badgeText, { color: '#FF4D00' }]}>{pending}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Animated.View>
          </View>
            </>
          )}
        </View>

        {/* A thin vertical line separating the date column from the task list. */}
        <View style={styles.vDivider} />

        {/* Right column: scrollable task list for the selected date. */}
        {/* keyboardShouldPersistTaps="handled" means tapping the ADD button while the
            keyboard is open still registers the tap (instead of just closing the keyboard). */}
        <GHScrollView
          ref={tasksScrollRef}
          style={styles.tasksCol}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={draggingTaskId === null}
          scrollEventThrottle={16}
          onScroll={(e) => {
            tasksScrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          onLayout={(e) => {
            taskListTopRef.current = e.nativeEvent.layout.y + insets.top;
            setTaskColWidth(e.nativeEvent.layout.width);
            measureTasksScroll();
            // Capture absolute left edge so the floating chip can pin to this column.
            (tasksScrollRef.current as any)?.measureInWindow?.((x: number) => {
              taskColLeftRef.current = x;
            });
          }}
        >
          {/* ── TODAY'S FOCUS card ────────────────────────── */}
          <Text style={styles.focusSection}>TODAY'S FOCUS</Text>

          {/* Tapping the name opens the bottom sheet to edit it. */}
          <TouchableOpacity onPress={() => openSheet('focus')} activeOpacity={0.7}>
            <Text style={[styles.focusName, !focusName && styles.focusNamePlaceholder]}>
              {focusName || 'TAP TO SET FOCUS'}
            </Text>
          </TouchableOpacity>

          {hasSavedSession && activeSessionLabel ? (
            <Text style={styles.focusSessionRemaining}>{activeSessionLabel}</Text>
          ) : (
            <TouchableOpacity
              style={styles.focusBlockBtn}
              onPress={() => {
                const next = (focusBlockIdx + 1) % FOCUS_BLOCKS.length;
                applyFocusSettings(focusName, next);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="clock-outline" size={13} color="#8C857B" />
              <Text style={styles.focusBlockLabel}>
                {focusBlockDisplayLabel(focusWorkMins, focusBreakMins, focusBlockIdx)}
              </Text>
            </TouchableOpacity>
          )}

          {/* START/RESUME FOCUS button — navigates to the timer screen.
              If there's a saved session, shows "RESUME FOCUS" and the timer will restore its state. */}
          <TouchableOpacity
            style={styles.startFocusBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (hasSavedSession) {
                // Resume: go to timer with no params, it'll load the saved session.
                router.push('/focus-timer');
              } else {
                // Start new: need focus name and block settings.
                if (!focusName.trim()) {
                  openSheet('focus');
                  return;
                }
                router.push({
                  pathname: '/focus-timer',
                  params: {
                    name:       focusName.trim(),
                    workMins:   String(focusWorkMins),
                    breakMins:  String(focusBreakMins),
                  },
                });
              }
            }}
          >
            <Text style={styles.startFocusBtnText}>
              {hasSavedSession ? 'RESUME FOCUS' : 'START FOCUS'}
            </Text>
          </TouchableOpacity>

          <View style={styles.focusDivider} />

          <Text style={styles.cardLabel}>
            {(() => {
              const selectedDate = DATES[selectedIndex];
              return `${selectedDate.month} ${formatOrdinal(parseInt(selectedDate.date, 10))} TASKS`;
            })()}
          </Text>

          {/* Show a placeholder message if there are no tasks. */}
          {tasks.length === 0 && (
            <TouchableOpacity
              style={styles.emptyWrap}
              onPress={() => openSheet('task')}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyTitle}>NOTHING PLANNED</Text>
              <Text style={styles.emptyHint}>Tap here to add your first task.</Text>
            </TouchableOpacity>
          )}

          {/* Render one row per task for the selected date. */}
          {tasks.map((task, taskIndex) => (
            <TaskRow
              key={task.id}
              task={task}
              taskIndex={taskIndex}
              isDragged={draggingTaskId === task.id}
              isCompleting={completingIds.has(task.id)}
              showGhostHere={!!(draggingTaskId && dragTargetIdx === taskIndex)}
              draggingTaskIdRef={draggingTaskIdRef}
              completingIdsRef={completingIdsRef}
              beginDragRef={beginTaskDragRef}
              dragMoveRef={handleDragMoveRef}
              dragEndRef={handleDragEndRef}
              toggleTaskRef={toggleTaskRef}
              onFirstRowLayout={y => {
                firstTaskWindowYRef.current = y;
              }}
            />
          ))}
          {draggingTaskId && dragTargetIdx === tasks.length && (
            <InsertionGhost key="insertion-end" />
          )}
          {/* Opens the bottom sheet to add a new task. */}
          <TouchableOpacity style={styles.addRow} onPress={() => openSheet('task')} activeOpacity={0.7}>
            <Text style={styles.addText}>+ ADD A NEW TASK...</Text>
          </TouchableOpacity>
        </GHScrollView>

      </View>

      {/* ── Tracker bar ────────────────────────────────── */}
      {/* A row of four stat cards at the bottom: steps, active time, calories, elevation.
          Currently shows placeholder/hardcoded values. */}
      <View style={styles.trackerBar}>
        {TRACKERS.map((t, i) => (
          // trackerItemFirst removes the left border from the first item (no double border at the edge).
          <View key={t.unit} style={[styles.trackerItem, i === 0 && styles.trackerItemFirst]}>
            <Text style={styles.trackerTop} numberOfLines={1}>{t.top}</Text>
            <MaterialCommunityIcons name={t.icon} size={22} color="#FF4D00" style={styles.trackerIcon} />
            <Text style={styles.trackerValue}>{t.value}</Text>
            <Text style={styles.trackerUnit}>{t.unit}</Text>
          </View>
        ))}
      </View>

      <DragTaskFloatingChip
        visible={!!draggingTask}
        label={draggingTask?.label ?? ''}
        width={taskColWidth}
        top={floatTop}
        left={floatLeft}
        danger={overDelete}
        onOverlayOrigin={setOverlayOrigin}
      />

      {/* ── Input modal ──────────────────────────────────── */}
      {/* Centered white card that floats above the keyboard. */}
      <Modal visible={sheetMode !== null} transparent animationType="none" onRequestClose={closeSheet}>
        {/* KAV pushes the card up so it's never hidden behind the keyboard. */}
        <KeyboardAvoidingView
          style={styles.sheetKAV}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Backdrop — tap outside the card to dismiss. */}
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
            <Animated.View
              pointerEvents="none"
              style={[styles.sheetBackdropDim, { opacity: sheetBackdropOpacity }]}
            />
            <Pressable style={styles.sheetGroup} onPress={() => {}}>
              <Animated.View style={[styles.sheetAnimatedWrap, { opacity: sheetAnim }]}>
                <View style={[styles.sheetCard, sheetMode === 'task' && styles.sheetCardTask]}>

                  <Text style={styles.sheetLabel}>
                    {sheetMode === 'focus' ? 'SET FOCUS' : 'NEW TASK'}
                  </Text>

                  <TextInput
                    style={[styles.sheetInput, sheetMode === 'task' && styles.sheetInputTask]}
                    value={sheetText}
                    onChangeText={setSheetText}
                    placeholder={sheetMode === 'focus' ? 'E.G. DEEP WORK' : 'TASK NAME...'}
                    placeholderTextColor="#C7C1B8"
                    autoFocus
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={confirmSheet}
                  />

                  {sheetMode === 'focus' && (
                    <>
                      <TouchableOpacity style={styles.sheetConfirm} onPress={confirmSheet} activeOpacity={0.85}>
                        <Text style={styles.sheetConfirmText}>SET FOCUS</Text>
                      </TouchableOpacity>
                      {(focusName.length > 0 || sheetText.trim().length > 0) && (
                        <TouchableOpacity
                          style={styles.sheetClearFocus}
                          onPress={() => { clearFocusSettings(); closeSheet(); }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.sheetClearFocusText}>CLEAR FOCUS</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {sheetMode === 'task' && (
                    <>
                      <View style={styles.sheetCardSpacer} />
                      <View style={styles.sheetCardFooter}>
                        <View style={styles.sheetCardDivider} />
                        <View style={styles.priorityRow}>
                          {(['LOW', 'MEDIUM', 'HIGH'] as Priority[]).map(p => (
                            <TouchableOpacity
                              key={p}
                              style={[
                                styles.priorityBtn,
                                styles[`priorityBtn_${p}`],
                                sheetPriority === p && styles.priorityBtnSelected,
                              ]}
                              onPress={() => setSheetPriority(p)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.priorityBtnText,
                                  styles.priorityBtnTextOnColor,
                                  sheetPriority === p && styles.priorityBtnTextSelected,
                                ]}
                              >
                                {p.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity
                          style={[styles.sheetConfirm, styles.sheetConfirmBottom]}
                          onPress={confirmSheet}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.sheetConfirmText}>ADD TASK</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                </View>
              </Animated.View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// All visual styles. Referenced by name in the JSX above.
const styles = StyleSheet.create({
  // Fills the entire screen with a light grey background.
  container: {
    flex: 1,
    backgroundColor: '#F2F0EC',
  },
  // Horizontal padding and vertical spacing for the header section.
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  // Wraps the "TODAY" text, logout button, and corner decorations in a horizontal row.
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  // "TODAY" in the large pixel font.
  title: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 28,
    color: '#1A1714',
  },
  // Base style for the decorative corner lines (shared by both corners).
  // position: 'absolute' means they're placed relative to the titleWrap container,
  // not in the normal flow of the layout.
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: '#FF4D00',
  },
  // Top-left corner: only the top and left borders are shown.
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  // Bottom-right corner: only the bottom and right borders are shown.
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  // "TRACK. GROW. THRIVE." tagline below the title.
  tagline: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    color: '#FF4D00',
    letterSpacing: 1,
    marginTop: 12,
  },
  // The horizontal row that holds the date column and task list side by side.
  // flex: 1 makes it fill all space between the header and the tracker bar.
  row: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  // The wheel's outer container — fills the full column height (so 3 big dates fit).
  // The row's default stretch makes this full-height; width sets the column size.
  wheelWrap: {
    width: 136,
    alignSelf: 'stretch',
    flexGrow: 0,
  },
  // The orange square locked in the centre slot. overflow:'hidden' clips the white date copy
  // inside it, so only the portion of a number over the square shows white. top + height inline.
  bandClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FF4D00',
    borderRadius: 14,
    overflow: 'hidden',
  },
  // The scroll view itself — fills the wrap; transparent so the orange band shows through.
  wheel: {
    flex: 1,
  },
  // One date row in the wheel. Height is set inline from itemH.
  wheelItem: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "TODAY" above the weekday when the selected date is the current day.
  wheelTodayLabel: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 8,
    letterSpacing: 1,
    color: '#FCFBF9',
  },
  // Day name (e.g. "MONDAY") above the number.
  wheelDay: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 12,
    marginBottom: 8,
    letterSpacing: 1,
  },
  // The big bold date number.
  wheelNum: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 52,
    lineHeight: 58,
  },
  // Month label at the bottom of the orange square (overlay only — does not affect row layout).
  wheelMonth: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: '#FCFBF9',
  },
  // The thin vertical line between the date column and task list.
  vDivider: {
    width: 1,
    backgroundColor: '#E5E1DA',
    marginHorizontal: 14,
  },
  // The right column — takes all remaining horizontal space (flex: 1).
  tasksCol: {
    flex: 1,
  },
  // "TODAY'S TASKS" label at the top of the task list.
  cardLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    color: '#FF4D00',
    marginBottom: 24,
    marginTop: 4,
    letterSpacing: 1,
  },
  // "NO TASKS YET." shown when the task list is empty.
  emptyWrap: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    color: '#8C857B',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyHint: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: '#C7C1B8',
  },
  // A single task row — the tappable main area plus the archive button, laid out horizontally.
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  // The tappable checkbox + label area. Vertical padding makes the touch target ~44px tall.
  taskMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  // Makes the whole task row semi-transparent once it's marked done.
  taskRowDone: { opacity: 0.4 },
  // The square checkbox button.
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#1A1714',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    flexShrink: 0, // Prevents the checkbox from shrinking if the task label is very long.
  },
  // Filled orange checkbox when the task is done.
  checkboxDone: {
    backgroundColor: '#FF4D00',
    borderColor: '#FF4D00',
  },
  // The "✓" tick inside a done checkbox.
  checkmark: {
    color: '#FCFBF9',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // The task name label — flex: 1 makes it take all available width between the checkbox and delete button.
  taskLabelWrap: {
    flex: 1,
  },
  taskLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    color: '#000000',
    lineHeight: 16,
  },
  // Strikethrough and grey text when the task is done.
  taskLabelDone: {
    textDecorationLine: 'line-through',
    color: '#8C857B',
  },
  // The original row turns into a faint dashed placeholder while its task is lifted out.
  taskRowDragging: {},
  // Dashed imprint — matches task row height (taskMain padding + checkbox).
  insertionGhost: {
    height: TASK_ROW_SLOT_PX - 6,
    marginBottom: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF4D00',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 77, 0, 0.06)',
  },
  // Invisible spacer at the dragged item's old index while the gap is elsewhere.
  dragRowSpacer: {
    height: 0,
    marginBottom: 0,
  },
  // Position number beside each task — no box, just the coloured numeral.
  priorityIndexWrap: {
    marginLeft: 8,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityIndexText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    lineHeight: 16,
  },
  // Full-height left column shown instead of the date wheel while dragging.
  deleteBinCol: {
    backgroundColor: '#FFF1F0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#FF4D00',
    borderStyle: 'dashed',
  },
  deleteBinLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
    color: '#FF4D00',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 16,
  },
  deleteBinLabelActive: {
    color: '#E03030',
  },
  // The "+ ADD A NEW TASK..." / "× CANCEL" row at the bottom of the task list.
  addRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E1DA',
    paddingTop: 16,
    marginTop: 4,
    marginBottom: 30,
  },
  addText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    color: '#FF4D00',
    letterSpacing: 0.5,
  },
  // The white card at the very bottom showing steps, active time, calories, elevation.
  trackerBar: {
    flexDirection: 'row',
    backgroundColor: '#FCFBF9',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E1DA',
    paddingVertical: 16,
  },
  // Each individual stat block inside the tracker bar.
  // flex: 1 gives each block equal width. borderLeftWidth creates dividers between them.
  trackerItem: {
    flex: 1,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E1DA',
    paddingHorizontal: 4,
  },
  // Removes the left border from the first tracker item (otherwise it would double up with the card border).
  trackerItemFirst: { borderLeftWidth: 0 },
  // The small label above each tracker icon (e.g. "TODAY'S STEPS").
  trackerTop: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 6,
    color: '#8C857B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  trackerIcon: { marginBottom: 8 },
  // The large value number (e.g. "16,842").
  trackerValue: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 15,
    color: '#FF4D00',
    marginBottom: 4,
  },
  // The unit label below the value (e.g. "STEPS").
  trackerUnit: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    color: '#8C857B',
    letterSpacing: 1,
  },
  // The small circular badge in the bottom-right corner of each date card,
  // showing how many tasks are still incomplete for that date.
  // position: 'absolute' places it on top of the card content without affecting layout.
  badge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10, // Makes it a circle.
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // The number inside the badge.
  badgeText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
  },

  // ── Today's Focus card ───────────────────────────────────────────
  focusSection: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 11,
    color: '#FF4D00',
    letterSpacing: 1,
    marginBottom: 12,
  },
  focusName: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 30,
    color: '#1A1714',
    lineHeight: 36,
    marginBottom: 8,
  },
  focusNamePlaceholder: {
    color: '#C7C1B8',
    fontSize: 22,
    lineHeight: 28,
  },
  focusBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  focusBlockLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: '#8C857B',
  },
  focusSessionRemaining: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 12,
    color: '#FF4D00',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  startFocusBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1A1714',
    borderRadius: 100,       // Full pill shape.
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  startFocusBtnText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#1A1714',
    letterSpacing: 1,
  },
  focusDivider: {
    height: 1,
    backgroundColor: '#E5E1DA',
    marginVertical: 20,
  },

  // ── Priority tags on task rows ───────────────────────────────────
  priorityTag: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    marginTop: 4,
    letterSpacing: 1,
  },
  priority_HIGH:   { color: '#E03030' },
  priority_MEDIUM: { color: '#8C857B' },
  priority_LOW:    { color: '#4A9B6F' },

  // ── Input modal ───────────────────────────────────────────────────
  // KAV fills the screen so the card can move upward above the keyboard.
  sheetKAV: {
    flex: 1,
  },
  // Backdrop — card sits lower on screen (above tab bar / keyboard).
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 56,
  },
  sheetBackdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetGroup: {
    width: '100%',
  },
  sheetAnimatedWrap: {
    width: '100%',
  },
  // The white card itself.
  sheetCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  sheetCardTask: {
    minHeight: 292,
    paddingVertical: 20,
    flexDirection: 'column',
  },
  sheetCardSpacer: {
    flexGrow: 1,
    minHeight: 4,
  },
  sheetCardFooter: {
    width: '100%',
  },
  sheetCardDivider: {
    height: 1,
    backgroundColor: '#E5E1DA',
    marginBottom: 14,
  },
  sheetLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#FF4D00',
    letterSpacing: 1,
    marginBottom: 16,
  },
  sheetInput: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 13,
    color: '#1A1714',
    borderBottomWidth: 2,
    borderBottomColor: '#E5E1DA',
    paddingVertical: 10,
    marginBottom: 20,
  },
  sheetInputTask: {
    marginBottom: 18,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 100,
  },
  priorityBtn_LOW: {
    backgroundColor: '#4A9B6F',
    borderColor: '#4A9B6F',
  },
  priorityBtn_MEDIUM: {
    backgroundColor: '#FF4D00',
    borderColor: '#FF4D00',
  },
  priorityBtn_HIGH: {
    backgroundColor: '#E03030',
    borderColor: '#E03030',
  },
  priorityBtnSelected: {
    borderColor: '#1A1714',
    transform: [{ scale: 1.04 }],
  },
  priorityBtnText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 7,
    letterSpacing: 1,
  },
  priorityBtnTextOnColor: {
    color: '#FCFBF9',
  },
  priorityBtnTextSelected: {
    fontFamily: 'PixeloidSans_700Bold',
  },
  sheetConfirm: {
    backgroundColor: '#FF4D00',
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetConfirmBottom: {
    marginTop: 0,
  },
  sheetConfirmText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    color: '#FCFBF9',
    letterSpacing: 1,
  },
  sheetClearFocus: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetClearFocusText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    color: '#8C857B',
    letterSpacing: 1,
  },
});
