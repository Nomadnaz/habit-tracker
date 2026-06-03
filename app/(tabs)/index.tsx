// useState stores values that can change and re-renders the screen when they do.
// useEffect runs code at specific moments — like when the screen first loads.
// useRef holds a value that survives re-renders without causing one (we use it for the scroll wheel).
import { useState, useEffect, useRef, useCallback } from 'react';

// useFocusEffect runs each time this screen comes into focus (e.g. switching back to this tab).
// useRouter lets us navigate to the focus timer screen.
import { useFocusEffect, useRouter } from 'expo-router';

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
  View,             // A box/container for grouping elements.
  Text,             // Displays text.
  ScrollView,       // A container that can be scrolled if the content is taller than the screen.
  StyleSheet,       // Used at the bottom to define all visual styles in one place.
  TouchableOpacity, // A pressable element (button) that responds to taps.
  TextInput,        // A field the user can type into.
  Keyboard,         // Lets us manually dismiss (hide) the on-screen keyboard.
  Animated,         // Lets us drive animations directly from the scroll position (for the wheel mask).
} from 'react-native';

// SafeAreaView automatically adds padding so content isn't hidden behind the camera notch
// or the home bar at the bottom of the phone.
import { SafeAreaView } from 'react-native-safe-area-context';

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

// TypeScript type definitions — these describe the shape of our data.
// A Task has an id (unique string), a label (the task name), and a done flag (checked or not).
// archived: when true, the task is hidden from the active list but kept forever
// (both on the device and in the cloud) so it can be shown in a history screen later.
type Task = { id: string; label: string; done: boolean; archived?: boolean };

// TaskMap is a dictionary where each key is a date string and the value is an array of tasks for that date.
// Example: { "2026-5-1": [{ id: "...", label: "Drink water", done: false }] }
type TaskMap = Record<string, Task[]>;

// Generates a random UUID (universally unique ID) in the standard format.
// We use this as the task's ID — it's the same ID stored both locally and in Supabase,
// so we can match them up when syncing (e.g. to update or delete the right row).
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Available focus block durations and their corresponding break lengths.
const FOCUS_BLOCKS = [
  { minutes: 25,  label: '25 MIN BLOCK',  breakMins: 5  },
  { minutes: 45,  label: '45 MIN BLOCK',  breakMins: 10 },
  { minutes: 60,  label: '60 MIN BLOCK',  breakMins: 15 },
  { minutes: 90,  label: '90 MIN BLOCK',  breakMins: 20 },
];

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
  const [focusName, setFocusName]   = useState('');
  const [focusBlockIdx, setFocusBlockIdx] = useState(3); // Default: 90 MIN BLOCK
  const [editingFocus, setEditingFocus]   = useState(false);
  const router = useRouter();

  // The text the user is currently typing into the "add task" input field.
  const [newTaskText, setNewTaskText] = useState('');

  // Whether the "add task" input row is currently visible or hidden.
  const [adding, setAdding] = useState(false);

  // The Supabase user ID of the logged-in user.
  // Needed when inserting tasks into Supabase so we know who they belong to.
  const [userId, setUserId] = useState<string | null>(null);

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

  // The wheel stays invisible until it has been positioned on today, so the user never sees it
  // settle into place — it just appears already parked on the current date.
  const [wheelReady, setWheelReady] = useState(false);

  // The blank padding above the first / below the last date, so they can reach the centre slot.
  const spacer = itemH * Math.floor(VISIBLE / 2);

  // The index of the currently centred date (used to colour past vs upcoming dates differently).
  const selectedIndex = DATES.findIndex(d => d.key === selectedKey);

  // Jumps the wheel so TODAY sits dead-centre (no animation, no haptic — it's not a user scroll).
  function centerOnToday() {
    if (itemH > 0) {
      userScrollingRef.current = false;
      wheelRef.current?.scrollTo({ y: TODAY_INDEX * itemH, animated: false });
    }
  }

  // Every time this screen comes into focus (first open, or switching back to this tab),
  // reset the selection to today and re-centre the wheel on it.
  useFocusEffect(
    useCallback(() => {
      setSelectedKey(DATES[TODAY_INDEX].key);
      lastIndexRef.current = TODAY_INDEX;
      // Only position + reveal once the row height is known (this callback re-runs when itemH
      // is measured). Two frames: the first centres on today, the second reveals the wheel —
      // so the positioning happens while it's still invisible.
      if (itemH > 0) {
        requestAnimationFrame(() => {
          centerOnToday();
          requestAnimationFrame(() => setWheelReady(true));
        });
      }
    }, [itemH])
  );

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
      const [raw, { data: { session } }] = await Promise.all([
        AsyncStorage.getItem('@tasks'),      // Check if tasks are saved on the device.
        supabase.auth.getSession(),          // Get the current logged-in user's session.
      ]);

      const uid = session?.user?.id ?? null; // Extract the user ID (or null if not logged in).
      setUserId(uid);

      if (raw) {
        // Tasks exist in AsyncStorage — parse the JSON string back into an object and use it.
        // This is the fast path: no network request needed.
        setTaskMap(JSON.parse(raw));
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
        setTaskMap(seeded);
        // Save to AsyncStorage so next launch is instant.
        AsyncStorage.setItem('@tasks', JSON.stringify(seeded));
      }
    };
    init();
  }, []); // The empty array [] means: only run this once, when the component first mounts.

  // ALL tasks stored for the selected date — including archived ones.
  // We use this version when SAVING changes, so archived tasks aren't accidentally lost.
  const allTasks = taskMap[selectedKey] ?? [];

  // Only the VISIBLE tasks (not archived) — this is what we actually show in the list.
  const tasks = allTasks.filter(t => !t.archived);

  // Saves a new version of the task map both in memory (instant UI update)
  // and to AsyncStorage (so it survives app restarts).
  function persist(newMap: TaskMap) {
    setTaskMap(newMap);                                         // Update the UI immediately.
    AsyncStorage.setItem('@tasks', JSON.stringify(newMap));    // Save to the device in the background.
  }

  // Flips a task between done and not done.
  function toggleTask(id: string) {
    const task = allTasks.find(t => t.id === id); // Find the task by its ID.
    if (!task) return;                          // Safety check — do nothing if not found.
    const newDone = !task.done;                // Flip the done state.

    // Build a new task map with this task updated.
    const newMap = {
      ...taskMap,                              // Copy all other dates unchanged.
      [selectedKey]: allTasks.map(t =>
        t.id === id ? { ...t, done: newDone } : t // Update only the matching task.
      ),
    };
    persist(newMap); // Save locally.

    // Also update Supabase in the background. .then(() => {}) is required to actually
    // trigger the network request — without it, Supabase won't send anything.
    supabase.from('tasks').update({ done: newDone }).eq('id', id).then(() => {});
  }

  // Creates a new task for the currently selected date.
  function addTask() {
    const label = newTaskText.trim(); // Remove leading/trailing spaces from the input.
    if (!label) return;               // Don't create a blank task.

    const id = generateId();          // Create a unique ID for this task.

    // Build a new task map with the new task appended to the current date's list.
    const newMap = {
      ...taskMap,
      [selectedKey]: [...allTasks, { id, label, done: false, archived: false }],
    };
    persist(newMap);      // Save locally.
    setNewTaskText('');   // Clear the input field.
    setAdding(false);     // Hide the input row.
    Keyboard.dismiss();   // Hide the on-screen keyboard.

    // Also insert into Supabase in the background.
    // We only do this if we have a userId — without it we can't set the user_id column.
    if (userId) supabase.from('tasks').insert({ id, user_id: userId, date: selectedKey, label, done: false }).then(() => {});
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

        {/* Left column: an iOS-style date wheel. Drag to spin it; whichever date is locked
            in the centre orange band is the selected one, and the task list updates to match.
            onLayout measures the column so 3 big dates fill its full height. */}
        <View
          style={[styles.wheelWrap, { opacity: wheelReady ? 1 : 0 }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            const next = Math.floor(h / VISIBLE);
            if (next > 0 && next !== itemH) {
              setItemH(next);
              // Park the overlay on today straight away so the white text lines up from frame one.
              scrollY.setValue(TODAY_INDEX * next);
            }
          }}
        >
          {/* Only render the wheel once we know the row height, so it can start already parked
              on today (via contentOffset) instead of visibly scrolling there after launch. */}
          {itemH > 0 && (
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
              const isPast = i < selectedIndex;          // Dates we've already scrolled past (above).
              // Faded grey once passed; solid black for upcoming dates. (The white version lives
              // in the overlay layer below, clipped to the orange square.)
              const color = isPast ? '#C7C1B8' : '#1A1714';
              const pending = (taskMap[d.key] ?? []).filter(t => !t.done).length;

              return (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.wheelItem, { height: itemH }]}
                  activeOpacity={0.8}
                  onPress={() => wheelRef.current?.scrollTo({ y: i * itemH, animated: true })}
                >
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
          <View style={[styles.bandClip, { top: spacer, height: itemH }]} pointerEvents="none">
            <Animated.View style={{ transform: [{ translateY: Animated.multiply(scrollY, -1) }] }}>
              {DATES.map((d, i) => {
                const pending = (taskMap[d.key] ?? []).filter(t => !t.done).length;
                return (
                  <View key={d.key} style={[styles.wheelItem, { height: itemH }]}>
                    <Text style={[styles.wheelDay, { color: '#FCFBF9' }]}>{d.day}</Text>
                    <Text style={[styles.wheelNum, { color: '#FCFBF9' }]}>{d.date}</Text>
                    {/* Month sits at the bottom of the orange square. Absolutely positioned so it
                        doesn't push the number off-centre (keeping it aligned with the layer below). */}
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
        <ScrollView
          style={styles.tasksCol}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── TODAY'S FOCUS card ────────────────────────── */}
          <Text style={styles.focusSection}>TODAY'S FOCUS</Text>

          {/* Tapping the name switches it to an editable input. */}
          {editingFocus ? (
            <TextInput
              style={styles.focusNameInput}
              value={focusName}
              onChangeText={setFocusName}
              placeholder="E.G. DEEP WORK"
              placeholderTextColor="#C7C1B8"
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => setEditingFocus(false)}
              onBlur={() => setEditingFocus(false)}
            />
          ) : (
            <TouchableOpacity onPress={() => setEditingFocus(true)} activeOpacity={0.7}>
              <Text style={[styles.focusName, !focusName && styles.focusNamePlaceholder]}>
                {focusName || 'TAP TO SET FOCUS'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Tapping the block label cycles through 25/45/60/90 min options. */}
          <TouchableOpacity
            style={styles.focusBlockBtn}
            onPress={() => setFocusBlockIdx(i => (i + 1) % FOCUS_BLOCKS.length)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="clock-outline" size={13} color="#8C857B" />
            <Text style={styles.focusBlockLabel}>{FOCUS_BLOCKS[focusBlockIdx].label}</Text>
          </TouchableOpacity>

          {/* START FOCUS button — navigates to the timer screen. */}
          <TouchableOpacity
            style={styles.startFocusBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (!focusName.trim()) {
                setEditingFocus(true);
                return;
              }
              router.push({
                pathname: '/focus-timer',
                params: {
                  name:       focusName.trim(),
                  workMins:   FOCUS_BLOCKS[focusBlockIdx].minutes,
                  breakMins:  FOCUS_BLOCKS[focusBlockIdx].breakMins,
                },
              });
            }}
          >
            <Text style={styles.startFocusBtnText}>START FOCUS</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#1A1714" />
          </TouchableOpacity>

          <View style={styles.focusDivider} />

          <Text style={styles.cardLabel}>TODAY'S TASKS</Text>

          {/* Show a placeholder message if there are no tasks and the input isn't open. */}
          {tasks.length === 0 && !adding && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>NOTHING PLANNED</Text>
              <Text style={styles.emptyHint}>Tap + below to add your first task.</Text>
            </View>
          )}

          {/* Render one row per task for the selected date. */}
          {tasks.map((task) => (
            // taskRowDone makes the whole row semi-transparent when the task is completed.
            <View key={task.id} style={[styles.taskRow, task.done && styles.taskRowDone]}>

              {/* The whole checkbox + label area is tappable to toggle done/not-done.
                  This gives a comfortable ~44px touch target instead of just the tiny box. */}
              <TouchableOpacity
                style={styles.taskMain}
                onPress={() => toggleTask(task.id)}
                activeOpacity={0.6}
              >
                <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
                  {/* Show a tick inside the checkbox only when the task is done. */}
                  {task.done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                {/* The task name. Gets a strikethrough style when done. */}
                <Text style={[styles.taskLabel, task.done && styles.taskLabelDone]}>
                  {task.label}
                </Text>
              </TouchableOpacity>

              {/* The × archive button — hides the task from the list but keeps it for history.
                  hitSlop makes the tap area larger than the visible button, so it's easier to tap. */}
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => archiveTask(task.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* The input row for typing a new task — only shown when adding is true. */}
          {adding && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="TASK NAME..."
                placeholderTextColor="#B3ABA0"
                value={newTaskText}
                onChangeText={setNewTaskText} // Updates state on every keystroke.
                autoFocus                     // Opens the keyboard automatically when this appears.
                onSubmitEditing={addTask}     // Pressing "done" on the keyboard triggers addTask.
                returnKeyType="done"          // Labels the keyboard's return key as "Done".
              />
              <TouchableOpacity style={styles.confirmBtn} onPress={addTask} activeOpacity={0.85}>
                <Text style={styles.confirmText}>ADD</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* The "+ ADD A NEW TASK..." button. Toggles the input row open/closed.
              When open, it changes to "× CANCEL" so the user can dismiss it. */}
          <TouchableOpacity style={styles.addRow} onPress={() => setAdding(a => !a)} activeOpacity={0.7}>
            <Text style={styles.addText}>{adding ? '× CANCEL' : '+ ADD A NEW TASK...'}</Text>
          </TouchableOpacity>
        </ScrollView>

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
    fontFamily: 'PressStart2P_400Regular',
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
    fontFamily: 'SpaceMono_700Bold',
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
  // One date row in the wheel. Height is set inline from itemH; content centred.
  wheelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Day name (e.g. "MONDAY") above the number.
  wheelDay: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 12,
    marginBottom: 8,
    letterSpacing: 1,
  },
  // The big bold date number.
  wheelNum: {
    fontFamily: 'PressStart2P_400Regular',
    fontSize: 52,
    lineHeight: 58,
  },
  // Month label at the bottom of the orange square (overlay copy only). Absolute so it doesn't
  // affect the vertical centring of the day + number above it.
  wheelMonth: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'SpaceMono_700Bold',
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
    fontFamily: 'SpaceMono_700Bold',
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
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 13,
    color: '#8C857B',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyHint: {
    fontFamily: 'SpaceMono_400Regular',
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
  taskLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 15,
    color: '#000000',
    flex: 1,
  },
  // Strikethrough and grey text when the task is done.
  taskLabelDone: {
    textDecorationLine: 'line-through',
    color: '#8C857B',
  },
  // The × delete button — small touch area, padded to make it easier to tap.
  removeBtn: { paddingLeft: 8 },
  removeText: { fontSize: 20, color: '#C7C1B8', lineHeight: 22 },
  // The row containing the text input and ADD button — shown when adding a new task.
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8, // Space between the text input and the ADD button.
  },
  // The text input field where the user types the new task name.
  input: {
    flex: 1,
    fontFamily: 'SpaceMono_400Regular',
    backgroundColor: '#FCFBF9',
    borderWidth: 1,
    borderColor: '#E5E1DA',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1A1714',
  },
  // The orange "ADD" button next to the text input.
  confirmBtn: {
    backgroundColor: '#FF4D00',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  confirmText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    color: '#FCFBF9',
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
    fontFamily: 'SpaceMono_700Bold',
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
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 6,
    color: '#8C857B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  trackerIcon: { marginBottom: 8 },
  // The large value number (e.g. "16,842").
  trackerValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 15,
    color: '#FF4D00',
    marginBottom: 4,
  },
  // The unit label below the value (e.g. "STEPS").
  trackerUnit: {
    fontFamily: 'SpaceMono_400Regular',
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
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 10,
  },

  // ── Today's Focus card ───────────────────────────────────────────
  focusSection: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    color: '#FF4D00',
    letterSpacing: 2,
    marginBottom: 8,
  },
  focusName: {
    fontFamily: 'SpaceMono_700Bold',
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
  focusNameInput: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 26,
    color: '#1A1714',
    borderBottomWidth: 2,
    borderBottomColor: '#FF4D00',
    paddingVertical: 4,
    marginBottom: 8,
  },
  focusBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  focusBlockLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 12,
    color: '#8C857B',
  },
  startFocusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#1A1714',
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 4,
  },
  startFocusBtnText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 12,
    color: '#1A1714',
    letterSpacing: 1,
  },
  focusDivider: {
    height: 1,
    backgroundColor: '#E5E1DA',
    marginVertical: 20,
  },
});
