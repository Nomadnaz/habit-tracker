// useState stores values that can change and re-renders the screen when they do.
// useEffect runs code at specific moments — like when the screen first loads.
// useRef holds a value that survives re-renders without causing one (we use it for the scroll wheel).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// useFocusEffect runs when this tab gains focus (e.g. switching back from GYM).
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';

// expo-haptics triggers the phone's vibration motor — used for the tactile "click" as dates scroll.
import * as Haptics from 'expo-haptics';


// AsyncStorage is the phone's built-in storage — like a tiny database saved on the device.
// We use it to remember tasks between app launches so they load instantly without a network call.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Our Supabase client — used to back up tasks to the cloud database.
import { supabase } from '@/lib/supabase';
import { toDateKey } from '@/lib/dateKey';
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
  loadBodyData,
  getTrackerBarItems,
  refreshAppleHealthIfConnected,
} from '@/lib/body-data';

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
  DeviceEventEmitter,
} from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { TaskRow, InsertionGhost } from '@/components/TaskRow';
import { DragTaskFloatingChip } from '@/components/DragTaskFloatingChip';
import { useTaskDragFloat } from '@/lib/task-drag-float';
import {
  TASK_ROW_SLOT_PX,
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_STEP_PX,
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
import {
  mergeAppleIdsIntoTaskMap,
  syncNewTaskToApple,
  syncTaskDoneToApple,
  syncTaskRemovedFromApple,
  syncTaskScheduleToApple,
} from '@/lib/apple-sync';
import { defaultReminderTime } from '@/lib/reminder-time';
import { useAppleReminderSync } from '@/lib/use-apple-reminder-sync';
import { TaskModalFields } from '@/components/TaskModalFields';
import { buildDateOptions, findTaskDateKey, moveTaskInMap } from '@/lib/task-schedule';
import { TASKS_CHANGED_EVENT } from '@/lib/use-remote-task-sync';
import { TASK_SELECT_COLUMNS, taskFromDbRow, taskToDbRow } from '@/lib/task-supabase';
import BriefingCard from '@/components/BriefingCard';
import { YearDots } from '@/components/YearDots';
import { WeekStrip, type ZoneRect } from '@/components/WeekStrip';

// Enable LayoutAnimation on Android (iOS enables it automatically).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// SafeAreaView automatically adds padding so content isn't hidden behind the camera notch
// or the home bar at the bottom of the phone.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// A library of icons. We use it for the step, clock, fire, and mountain icons in the tracker bar.
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { C, F } from '@/lib/theme';
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
      // The key is a unique string like "2026-06-01" used to look up tasks for that day.
      key: toDateKey(d),
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

const DEFAULT_TRACKERS = getTrackerBarItems({
  workoutsTotal: 0,
  stepsThisYear: 0,
  streak: 0,
  stepsGoal: 10000,
  stepsHistory: {},
  nextSession: null,
  trainingHistory: {},
  activeMovement: 'pull',
  headlineLifts: [],
  weightLogs: [],
  leastTrainedMuscle: null,
  strengthTrend: null,
  sleepMins: null,
  waterLogs: [],
  waterGoalMl: 3000,
  proteinTodayG: 0,
  proteinGoalG: 160,
});

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
  const [trackers, setTrackers] = useState(DEFAULT_TRACKERS);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  // Drag refs — stable handlers for RNGH pan gestures (long-press then drag).
  const draggingTaskIdRef  = useRef<string | null>(null);   // mirrors draggingTaskId state
  const { floatTop, floatLeft, startFloat, moveFloat, syncColumnLeft, setOverlayOrigin } =
    useTaskDragFloat();
  const overDeleteRef      = useRef(false);
  const [overDelete, setOverDelete] = useState(false);
  const overEditRef        = useRef(false);
  const [overEdit, setOverEdit]     = useState(false);
  // Window rect of the week strip, which becomes the DELETE | EDIT drop zones mid-drag.
  const zoneRectRef        = useRef<ZoneRect>({ top: 0, bottom: 0, midX: 0 });
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

  // ── Edit mode (pencil icon on task list header) ────────────────────
  const [editMode,     setEditMode]     = useState(false);
  const editModeRef = useRef(editMode);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // ── Bottom sheet (focus slides up; task modal fades in centred) ──
  const [sheetMode,     setSheetMode]     = useState<'focus' | 'task' | null>(null);
  const [sheetText,     setSheetText]     = useState('');
  const [sheetPriority, setSheetPriority] = useState<Priority>('MEDIUM');
  const [sheetHour, setSheetHour] = useState(() => defaultReminderTime().hour);
  const [sheetMinute, setSheetMinute] = useState(() => defaultReminderTime().minute);
  const [sheetDateIndex, setSheetDateIndex] = useState(0);
  const [sheetLocation, setSheetLocation] = useState('');
  const dateOptions = useMemo(() => buildDateOptions(new Date()), []);
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const sheetHourRef = useRef(sheetHour);
  const sheetMinuteRef = useRef(sheetMinute);
  const sheetDateIndexRef = useRef(sheetDateIndex);
  sheetHourRef.current = sheetHour;
  sheetMinuteRef.current = sheetMinute;
  sheetDateIndexRef.current = sheetDateIndex;

  const onSheetDatePreview = useCallback((i: number) => {
    sheetDateIndexRef.current = i;
  }, []);
  const onSheetDateCommit = useCallback((i: number) => {
    sheetDateIndexRef.current = i;
    setSheetDateIndex(i);
  }, []);
  const onSheetHourPreview = useCallback((h: number) => {
    sheetHourRef.current = h;
  }, []);
  const onSheetHourCommit = useCallback((h: number) => {
    sheetHourRef.current = h;
    setSheetHour(h);
  }, []);
  const onSheetMinutePreview = useCallback((m: number) => {
    sheetMinuteRef.current = m;
  }, []);
  const onSheetMinuteCommit = useCallback((m: number) => {
    sheetMinuteRef.current = m;
    setSheetMinute(m);
  }, []);

  const sheetEaseOut = Easing.bezier(0.22, 1, 0.36, 1);
  const sheetEaseIn = Easing.bezier(0.4, 0, 0.2, 1);

  function openSheet(mode: 'focus' | 'task') {
    setSheetText(mode === 'focus' ? focusName : '');
    setSheetPriority('MEDIUM');
    if (mode === 'task') {
      const t = defaultReminderTime();
      setSheetHour(t.hour);
      setSheetMinute(t.minute);
      setSheetLocation('');
      setEditingTaskId(null);
      const idx = dateOptions.findIndex(d => d.key === selectedKey);
      setSheetDateIndex(idx >= 0 ? idx : 0);
    }
    setSheetMode(mode);
    if (mode === 'task') {
      sheetAnim.setValue(1);
      return;
    }
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
    setEditingTaskId(null);
    if (sheetMode === 'task') {
      setSheetMode(null);
      sheetAnim.setValue(0);
      return;
    }
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
    if (sheetMode === 'task') {
      if (!text) {
        closeSheet();
        return;
      }
      const label = text.toUpperCase();
      const dateKey = dateOptions[sheetDateIndexRef.current]?.key ?? selectedKey;
      const location = sheetLocation.trim().toUpperCase() || undefined;
      const saveHour = sheetHourRef.current;
      const saveMinute = sheetMinuteRef.current;

      if (editingTaskId) {
        const fromKey = findTaskDateKey(taskMap, editingTaskId) ?? selectedKey;
        const existing = (taskMap[fromKey] ?? []).find(t => t.id === editingTaskId);
        const newMap = moveTaskInMap(
          taskMap,
          fromKey,
          dateKey,
          editingTaskId,
          {
            label,
            priority: sheetPriority,
            hour: saveHour,
            minute: saveMinute,
            location,
            durationMins: existing?.durationMins,
          },
          sortActiveTasks,
        );
        persist(newMap);
        const updated = (newMap[dateKey] ?? []).find(t => t.id === editingTaskId);
        if (userId && updated) {
          void supabase.from('tasks').update(taskToDbRow(updated, dateKey, userId)).eq('id', editingTaskId);
        }
        if (updated) void syncTaskScheduleToApple(updated, { dateKey });
      } else {
        const id = generateId();
        const dayList = taskMap[dateKey] ?? [];
        const dayActive = dayList.filter(t => !t.archived);
        const dayArchived = dayList.filter(t => t.archived);
        const newTask: Task = {
          id,
          label,
          done: false,
          archived: false,
          priority: sheetPriority,
          hour: saveHour,
          minute: saveMinute,
          location,
        };
        const newMap = {
          ...taskMap,
          [dateKey]: [...insertNewActiveTask(dayActive, newTask), ...dayArchived],
        };
        void (async () => {
          await persist(newMap);
          if (userId) {
            const { error } = await supabase.from('tasks').insert(taskToDbRow(newTask, dateKey, userId));
            if (error) console.warn('[task insert] failed:', error.code, error.message);
          }
          const ids = await syncNewTaskToApple({
            label,
            dateKey,
            mode: 'reminders-only',
            hour: saveHour,
            minute: saveMinute,
            location,
            priority: sheetPriority,
          });
          if (!ids.appleReminderId && !ids.appleEventId) return;
          setTaskMap(prev => {
            const next = mergeAppleIdsIntoTaskMap(prev, dateKey, id, ids);
            void AsyncStorage.setItem('@tasks', JSON.stringify(next));
            return next;
          });
        })();
      }
      closeSheet();
    }
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    setSheetText(task.label);
    setSheetPriority(task.priority ?? 'MEDIUM');
    setSheetLocation(task.location ?? '');
    const fromKey = findTaskDateKey(taskMap, task.id) ?? selectedKey;
    const idx = dateOptions.findIndex(d => d.key === fromKey);
    setSheetDateIndex(idx >= 0 ? idx : 0);
    if (task.hour != null && task.minute != null) {
      setSheetHour(task.hour);
      setSheetMinute(task.minute);
    } else {
      const t = defaultReminderTime();
      setSheetHour(t.hour);
      setSheetMinute(t.minute);
    }
    setSheetMode('task');
    sheetAnim.setValue(1);
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
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

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

  const todayDateKey = DATES[TODAY_INDEX].key;
  const selectedIndex = DATES.findIndex(d => d.key === selectedKey);

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
      setSelectedKey(DATES[targetIndex].key);

      refreshFocusSessionPreview();

      void (async () => {
        let body = await loadBodyData();
        if (body.appleHealthConnected) {
          const updated = await refreshAppleHealthIfConnected();
          if (updated) body = updated;
        }
        setTrackers(getTrackerBarItems(body));
      })();
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
        .select(TASK_SELECT_COLUMNS)
        .eq('user_id', uid)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        const seeded: TaskMap = {};
        for (const row of data) {
          const dateKey = String(row.date);
          if (!seeded[dateKey]) seeded[dateKey] = [];
          seeded[dateKey].push(taskFromDbRow(row as Record<string, unknown>));
        }
        const normalized = normalizeTaskMap(seeded);
        setTaskMap(normalized);
        // Save to AsyncStorage so next launch is instant.
        AsyncStorage.setItem('@tasks', JSON.stringify(normalized));
      }
    };
    init();
  }, []); // The empty array [] means: only run this once, when the component first mounts.

  // Refresh the list when a task is synced in from outside the app (e.g. created
  // by the voice device → ai-chat → useRemoteTaskSync writes @tasks).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TASKS_CHANGED_EVENT, () => {
      AsyncStorage.getItem('@tasks').then(raw => {
        if (raw) setTaskMap(normalizeTaskMap(JSON.parse(raw) as TaskMap));
      });
    });
    return () => sub.remove();
  }, []);

  useAppleReminderSync(
    taskMap,
    setTaskMap,
    userId,
    changes => {
      if (changes.some(c => c.done)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    imports => {
      if (imports.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  );

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
  function persist(newMap: TaskMap): Promise<void> {
    setTaskMap(newMap);
    return AsyncStorage.setItem('@tasks', JSON.stringify(newMap)).then(() => undefined);
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
    void syncTaskDoneToApple(task, newDone, {
      dateKey: selectedKey,
      hour: task.hour,
      minute: task.minute,
    }).then(newReminderId => {
      if (!newReminderId || newReminderId === task.appleReminderId) return;
      setTaskMap(prev => {
        const next = mergeAppleIdsIntoTaskMap(prev, selectedKey, id, {
          appleReminderId: newReminderId,
        });
        AsyncStorage.setItem('@tasks', JSON.stringify(next));
        return next;
      });
    });
  }

  // Archives a task: hides it from the active list but keeps it forever
  // (on the device AND in the cloud) so it can be shown in a history screen later.
  function archiveTask(id: string) {
    const task = allTasks.find(t => t.id === id);
    // Build a new task map where the matching task is marked archived (not removed).
    const newMap = {
      ...taskMap,
      [selectedKey]: allTasks.map(t =>
        t.id === id ? { ...t, archived: true } : t // Flag it instead of deleting it.
      ),
    };
    persist(newMap); // Save locally.

    if (task) void syncTaskRemovedFromApple(task);

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

  // Called from endDrag when task dropped on edit zone. Ref so it's always current.
  const openEditFromDragRef = useRef((_taskId: string) => {});
  useEffect(() => {
    openEditFromDragRef.current = (taskId: string) => {
      const key = selectedKeyRef2.current;
      const task = (taskMapRef.current[key] ?? []).find(t => t.id === taskId);
      if (task) openEditTask(task);
    };
  });

  // Stable endDrag — reads from refs so drag handlers can call it safely.
  const endDragRef = useRef((taskId: string) => {
    stopAutoScrollRef.current();
    if (overEditRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => openEditFromDragRef.current(taskId), 80);
    } else if (overDeleteRef.current) {
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
    overEditRef.current   = false;
    dragTargetIdxRef.current = null;
    setOverDelete(false);
    setOverEdit(false);
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

      // Over the week strip = over the drop zones: left half deletes, right half edits.
      const zone = zoneRectRef.current;
      const inBin    = pageY >= zone.top - 12 && pageY <= zone.bottom + 12;
      const inDelete = inBin && pageX < zone.midX;
      const inEdit   = inBin && pageX >= zone.midX;
      if (inBin) stopAutoScrollRef.current();
      else updateAutoScrollRef.current(pageY);

      if (inDelete !== overDeleteRef.current) {
        overDeleteRef.current = inDelete;
        setOverDelete(inDelete);
        if (inDelete) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      if (inEdit !== overEditRef.current) {
        overEditRef.current = inEdit;
        setOverEdit(inEdit);
        if (inEdit) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      // Clear delete when hovering edit zone and vice-versa.
      if (!inDelete && overDeleteRef.current) { overDeleteRef.current = false; setOverDelete(false); }
      if (!inEdit   && overEditRef.current)   { overEditRef.current   = false; setOverEdit(false);   }

      if (!inBin) {
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
      // Capture the edit flag before endDrag clears it.
      const wasEdit = overEditRef.current;
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

      {/* ── Header: date eyebrow + TODAY, the 4 things TODAY owns ── */}
      <View style={styles.header}>
        {/* The date opens the calendar; profile lives under LIFE. */}
        <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/calendar')} activeOpacity={0.7}>
          <Text style={styles.eyebrow}>
            {(() => {
              const n = new Date();
              return `${DAY_NAMES[n.getDay()].slice(0, 3)} ${String(n.getDate()).padStart(2, '0')} ${MONTH_NAMES[n.getMonth()].slice(0, 3)} ›`;
            })()}
          </Text>
          <Text style={styles.title}>TODAY</Text>
        </TouchableOpacity>
        {([
          ['magnify', '/modals/search'],
          ['cog-outline', '/settings'],
        ] as const).map(([icon, route]) => (
          <TouchableOpacity key={route} onPress={() => router.push(route as any)} hitSlop={8} style={styles.headIcon}>
            <MaterialCommunityIcons name={icon} size={19} color={C.dim} />
          </TouchableOpacity>
        ))}
      </View>

      <YearDots />

      <BriefingCard />

      {/* Week of days; becomes the DELETE | EDIT drop zones while a task is dragged. */}
      <WeekStrip
        dates={DATES}
        selectedKey={selectedKey}
        todayKey={todayDateKey}
        pending={key => (taskMap[key] ?? []).filter(t => !t.done && !t.archived).length}
        onSelect={setSelectedKey}
        dragging={!!draggingTaskId}
        overDelete={overDelete}
        overEdit={overEdit}
        onZoneLayout={r => { zoneRectRef.current = r; }}
      />

      {/* ── Task list: full width under the strip ─────────── */}
      <View style={styles.row}>

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
          {/* ── Focus: one row — name (tap to edit), block length (tap to cycle), play ── */}
          <View style={styles.focusRow}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => openSheet('focus')} activeOpacity={0.7}>
                <Text style={styles.focusSection}>FOCUS</Text>
                <Text style={[styles.focusName, !focusName && styles.focusNamePlaceholder]} numberOfLines={1}>
                  {focusName || 'SET A FOCUS'}
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
                  hitSlop={{ top: 8, bottom: 8, left: 0, right: 12 }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="clock-outline" size={12} color={C.dim} />
                  <Text style={styles.focusBlockLabel}>
                    {focusBlockDisplayLabel(focusWorkMins, focusBreakMins, focusBlockIdx)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Start / resume — goes to the timer screen; with no focus name it opens the sheet first. */}
            <TouchableOpacity
              style={styles.startFocusBtn}
              activeOpacity={0.85}
              accessibilityLabel={hasSavedSession ? 'Resume focus' : 'Start focus'}
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
              <MaterialCommunityIcons name={hasSavedSession ? 'play-pause' : 'play'} size={22} color={C.onHot} />
            </TouchableOpacity>
          </View>

          <View style={styles.cardLabelRow}>
            <View style={styles.cardLabelCol}>
              <Text style={styles.cardLabelDate}>
                {(() => {
                  const selectedDate = DATES[selectedIndex];
                  return `${selectedDate.month} ${formatOrdinal(parseInt(selectedDate.date, 10))}`;
                })()}
              </Text>
              <Text style={styles.cardLabel}>TASKS</Text>
            </View>
            <TouchableOpacity
              onPress={() => setEditMode(m => !m)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.editHeaderBtn, editMode && styles.editModeActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.editHeaderBtnText, editMode && styles.editHeaderBtnTextActive]}>
                {editMode ? 'DONE' : 'EDIT'}
              </Text>
            </TouchableOpacity>
          </View>

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
          {editMode && tasks.length > 0 && (
            <Text style={styles.editHint}>TAP A TASK TO EDIT · TAP − TO REMOVE</Text>
          )}
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
              editMode={editMode}
              onRemove={archiveTask}
              onEditPress={editMode ? openEditTask : undefined}
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
      {/* ── Focus sheet (slides from bottom, existing behaviour) ─────── */}
      <Modal
        visible={sheetMode === 'focus'}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView style={styles.sheetKAV} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
            <Animated.View pointerEvents="none" style={[styles.sheetBackdropDim, { opacity: sheetBackdropOpacity }]} />
            <Pressable style={styles.sheetGroup} onPress={e => e.stopPropagation()}>
              <Animated.View style={[styles.sheetAnimatedWrap, { opacity: sheetAnim }]}>
                <View style={styles.sheetCard}>
                  <Text style={styles.sheetLabel}>SET FOCUS</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={sheetText}
                    onChangeText={setSheetText}
                    placeholder="E.G. DEEP WORK"
                    placeholderTextColor={C.faint}
                    autoFocus
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={confirmSheet}
                  />
                  <TouchableOpacity style={styles.sheetConfirm} onPress={confirmSheet} activeOpacity={0.85}>
                    <Text style={styles.sheetConfirmText}>SET FOCUS</Text>
                  </TouchableOpacity>
                  {(focusName.length > 0 || sheetText.trim().length > 0) && (
                    <TouchableOpacity style={styles.sheetClearFocus} onPress={() => { clearFocusSettings(); closeSheet(); }} activeOpacity={0.7}>
                      <Text style={styles.sheetClearFocusText}>CLEAR FOCUS</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={sheetMode === 'task'}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <View style={{ flex: 1 }}>
          <Pressable style={styles.taskModalBackdrop} onPress={closeSheet}>
            <Pressable style={styles.taskModalCard} onPress={e => e.stopPropagation()}>
              <Text style={styles.sheetLabel}>
                {editingTaskId ? 'EDIT TASK' : 'NEW TASK'}
              </Text>
              <TextInput
                style={[styles.sheetInput, styles.sheetInputTask]}
                value={sheetText}
                onChangeText={setSheetText}
                placeholder="TASK NAME..."
                placeholderTextColor={C.faint}
                autoFocus={!editingTaskId}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={confirmSheet}
              />
              <TaskModalFields
                dateIndex={sheetDateIndex}
                onDatePreview={onSheetDatePreview}
                onDateCommit={onSheetDateCommit}
                hour={sheetHour}
                minute={sheetMinute}
                onHourPreview={onSheetHourPreview}
                onHourCommit={onSheetHourCommit}
                onMinutePreview={onSheetMinutePreview}
                onMinuteCommit={onSheetMinuteCommit}
                location={sheetLocation}
                onLocationChange={setSheetLocation}
                priority={sheetPriority}
                onPriorityChange={setSheetPriority}
                footer={
                  <>
                    <View style={styles.sheetCardDivider} />
                    <TouchableOpacity
                      style={[styles.sheetConfirm, styles.sheetConfirmBottom]}
                      onPress={confirmSheet}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.sheetConfirmText}>
                        {editingTaskId ? 'SAVE TASK' : 'ADD TASK'}
                      </Text>
                    </TouchableOpacity>
                  </>
                }
              />
            </Pressable>
          </Pressable>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// All visual styles. Referenced by name in the JSX above.
const styles = StyleSheet.create({
  // Fills the entire screen with a light grey background.
  container: {
    flex: 1,
    backgroundColor: C.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 4,
  },
  eyebrow: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 2 },
  headIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  // The horizontal row that holds the date column and task list side by side.
  // flex: 1 makes it fill all space between the header and the tracker bar.
  row: {
    flex: 1,
    paddingHorizontal: 16,
  },
  // The right column — takes all remaining horizontal space (flex: 1).
  tasksCol: {
    flex: 1,
  },
  // "TODAY'S TASKS" label at the top of the task list.
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardLabelCol: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  cardLabelDate: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 2 },
  cardLabel: { fontFamily: F.dot, fontSize: 15, color: C.ink, letterSpacing: 2 },
  editHint: {
    fontFamily: F.mono,
    fontSize: 10,
    color: C.dim,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  editHeaderBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    marginRight: -12,
    justifyContent: 'center',
  },
  editHeaderBtnText: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2 },
  editHeaderBtnTextActive: {
    color: C.hot,
  },
  editModeActive: {
    backgroundColor: C.raised,
    borderRadius: 22,
  },
  // Edit mode task rows.
  editModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  editModeRowDone: { opacity: 0.45 },
  editModeLabel: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.ink,
  },
  editModeMeta: {
    fontFamily: F.mono,
    fontSize: 10,
    color: C.dim,
    marginTop: 2,
  },
  editModeLabelDone: {
    textDecorationLine: 'line-through',
    color: C.dim,
  },
  // "NO TASKS YET." shown when the task list is empty.
  emptyWrap: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.dot, fontSize: 13, color: C.dim, letterSpacing: 2, marginBottom: 8 },
  emptyHint: {
    fontFamily: F.mono,
    fontSize: 13,
    lineHeight: 19,
    color: C.faint,
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
    borderColor: C.lineHi,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    flexShrink: 0, // Prevents the checkbox from shrinking if the task label is very long.
  },
  // Filled orange checkbox when the task is done.
  checkboxDone: {
    backgroundColor: C.hot,
    borderColor: C.hot,
  },
  // The "✓" tick inside a done checkbox.
  checkmark: {
    color: C.onHot,
    fontSize: 14,
    fontWeight: 'bold',
  },
  // The task name label — flex: 1 makes it take all available width between the checkbox and delete button.
  taskLabelWrap: {
    flex: 1,
  },
  taskLabel: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.ink,
    lineHeight: 16,
  },
  // Strikethrough and grey text when the task is done.
  taskLabelDone: {
    textDecorationLine: 'line-through',
    color: C.dim,
  },
  // The original row turns into a faint dashed placeholder while its task is lifted out.
  taskRowDragging: {},
  // Dashed imprint — matches task row height (taskMain padding + checkbox).
  insertionGhost: {
    height: TASK_ROW_SLOT_PX - 6,
    marginBottom: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.hot,
    borderRadius: 4,
    backgroundColor: C.raised,
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
    fontFamily: F.mono,
    fontSize: 13,
    lineHeight: 16,
  },
  // Each half of the split bin (delete top, edit bottom).
  binFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  deleteBinLabel: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.hot,
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 16,
  },
  deleteBinLabelActive: {
    color: C.alert,
  },
  // The "+ ADD A NEW TASK..." / "× CANCEL" row at the bottom of the task list.
  addRow: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 16,
    marginTop: 4,
    marginBottom: 30,
  },
  addText: { fontFamily: F.dot, fontSize: 13, color: C.ink, letterSpacing: 1.5 },
  // The white card at the very bottom showing steps, active time, calories, elevation.
  trackerBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 16,
  },
  // Each individual stat block inside the tracker bar.
  // flex: 1 gives each block equal width. borderLeftWidth creates dividers between them.
  trackerItem: {
    flex: 1,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: C.line,
    paddingHorizontal: 4,
  },
  // Removes the left border from the first tracker item (otherwise it would double up with the card border).
  trackerItemFirst: { borderLeftWidth: 0 },
  // The small label above each tracker icon (e.g. "TODAY'S STEPS").
  trackerTop: {
    fontFamily: F.mono,
    fontSize: 7,
    color: C.dim,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  trackerIcon: { marginBottom: 8 },
  // The large value number (e.g. "16,842").
  trackerValue: {
    fontFamily: F.mono,
    fontSize: 15,
    color: C.hot,
    marginBottom: 4,
  },
  // The unit label below the value (e.g. "STEPS").
  trackerUnit: {
    fontFamily: F.mono,
    fontSize: 8,
    color: C.dim,
    letterSpacing: 1,
  },

  // ── Today's Focus card ───────────────────────────────────────────
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    marginBottom: 18,
  },
  focusSection: { fontFamily: F.dot, fontSize: 9, color: C.dim, letterSpacing: 2, marginBottom: 3 },
  focusName: {
    fontFamily: F.dot,
    fontSize: 16,
    color: C.ink,
    letterSpacing: 1,
  },
  focusNamePlaceholder: {
    color: C.faint,
  },
  focusBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  focusBlockLabel: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.dim,
  },
  focusSessionRemaining: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.hot,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  startFocusBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.hot },

  // ── Priority tags on task rows ───────────────────────────────────
  priorityTag: {
    fontFamily: F.mono,
    fontSize: 8,
    marginTop: 4,
    letterSpacing: 1,
  },
  priority_HIGH:   { color: C.alert },
  priority_MEDIUM: { color: C.dim },
  priority_LOW:    { color: C.live },

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
  sheetGroupCentered: {
    maxWidth: 340,
    width: '100%',
  },
  sheetAnimatedWrap: {
    width: '100%',
  },
  // The white card itself.
  sheetCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  sheetCardTask: {
    paddingVertical: 16,
    flexDirection: 'column',
  },
  sheetBackdropCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  // Task modal — matches exercise modal structure exactly.
  taskModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  taskModalCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  sheetTaskScroll: {
    flexGrow: 0,
  },
  sheetCardFooter: {
    width: '100%',
  },
  sheetCardDivider: {
    height: 1,
    backgroundColor: C.line,
    marginBottom: 14,
  },
  sheetLabel: {
    fontFamily: F.mono,
    fontSize: 10,
    color: C.hot,
    letterSpacing: 1,
    marginBottom: 16,
  },
  sheetInput: {
    fontFamily: F.mono,
    fontSize: 13,
    color: C.ink,
    borderBottomWidth: 2,
    borderBottomColor: C.line,
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
    backgroundColor: C.live,
    borderColor: C.live,
  },
  priorityBtn_MEDIUM: {
    backgroundColor: C.hot,
    borderColor: C.hot,
  },
  priorityBtn_HIGH: {
    backgroundColor: C.alert,
    borderColor: C.alert,
  },
  priorityBtnSelected: {
    borderColor: C.lineHi,
    transform: [{ scale: 1.04 }],
  },
  priorityBtnText: {
    fontFamily: F.mono,
    fontSize: 8,
    letterSpacing: 1,
  },
  priorityBtnTextOnColor: {
    color: C.onHot,
  },
  priorityBtnTextSelected: {
    fontFamily: F.mono,
  },
  sheetConfirm: {
    backgroundColor: C.hot,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetConfirmBottom: {
    marginTop: 0,
  },
  sheetConfirmText: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.onHot,
    letterSpacing: 1,
  },
  sheetClearFocus: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetClearFocusText: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.dim,
    letterSpacing: 1,
  },
});
