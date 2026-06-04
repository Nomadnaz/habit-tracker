import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import {
  generateTaskId,
  insertNewActiveTask,
  sortActiveTasks,
  type Priority,
  type Task,
  type TaskMap,
} from '@/lib/tasks-core';
import {
  mergeAppleIdsIntoTaskMap,
  syncNewTaskToApple,
  syncTaskScheduleToApple,
} from '@/lib/apple-sync';
import { useAppleReminderSync } from '@/lib/use-apple-reminder-sync';
import { defaultReminderTime } from '@/lib/reminder-time';
import { TaskModalFields } from '@/components/TaskModalFields';
import { DateTaskList } from '@/components/DateTaskList';
import { buildDateOptions, findTaskDateKey, moveTaskInMap, parseDateKey } from '@/lib/task-schedule';
import { taskToDbRow } from '@/lib/task-supabase';

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function formatOrdinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}TH`;
  const lastDigit = day % 10;
  if (lastDigit === 1) return `${day}ST`;
  if (lastDigit === 2) return `${day}ND`;
  if (lastDigit === 3) return `${day}RD`;
  return `${day}TH`;
}

export default function DayScreen() {
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string | string[] }>();
  const dateKey = Array.isArray(dateParam) ? (dateParam[0] ?? '') : (dateParam ?? '');

  const parsed = useMemo(() => parseDateKey(dateKey), [dateKey]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dateOptions = useMemo(() => buildDateOptions(new Date()), []);

  const [taskMap, setTaskMap] = useState<TaskMap>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [sheetText, setSheetText] = useState('');
  const [sheetPriority, setSheetPriority] = useState<Priority>('MEDIUM');
  const [sheetHour, setSheetHour] = useState(() => defaultReminderTime().hour);
  const [sheetMinute, setSheetMinute] = useState(() => defaultReminderTime().minute);
  const [sheetDateIndex, setSheetDateIndex] = useState(0);
  const [sheetLocation, setSheetLocation] = useState('');
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

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('@tasks').then(raw => {
        if (raw) setTaskMap(JSON.parse(raw) as TaskMap);
      });
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUserId(session?.user?.id ?? null);
      });
    }, []),
  );

  useAppleReminderSync(taskMap, setTaskMap, userId);

  function persist(map: TaskMap) {
    setTaskMap(map);
    void AsyncStorage.setItem('@tasks', JSON.stringify(map));
  }

  function openSheet(task: Task | null) {
    setEditingTaskId(task?.id ?? null);
    setSheetText(task?.label ?? '');
    setSheetPriority(task?.priority ?? 'MEDIUM');
    setSheetLocation(task?.location ?? '');
    const key = task ? (findTaskDateKey(taskMap, task.id) ?? dateKey) : dateKey;
    const idx = dateOptions.findIndex(d => d.key === key);
    setSheetDateIndex(idx >= 0 ? idx : 0);
    if (task?.hour != null && task?.minute != null) {
      setSheetHour(task.hour);
      setSheetMinute(task.minute);
    } else {
      const t = defaultReminderTime();
      setSheetHour(t.hour);
      setSheetMinute(t.minute);
    }
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingTaskId(null);
  }

  function confirmSheet() {
    const text = sheetText.trim();
    if (!text) {
      closeSheet();
      return;
    }
    const label = text.toUpperCase();
    const targetKey = dateOptions[sheetDateIndexRef.current]?.key ?? dateKey;
    const location = sheetLocation.trim().toUpperCase() || undefined;
    const saveHour = sheetHourRef.current;
    const saveMinute = sheetMinuteRef.current;

    if (editingTaskId) {
      const fromKey = findTaskDateKey(taskMap, editingTaskId) ?? dateKey;
      const existing = (taskMap[fromKey] ?? []).find(t => t.id === editingTaskId);
      const newMap = moveTaskInMap(
        taskMap,
        fromKey,
        targetKey,
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
      const updated = (newMap[targetKey] ?? []).find(t => t.id === editingTaskId);
      if (userId && updated) {
        void supabase.from('tasks').update(taskToDbRow(updated, targetKey, userId)).eq('id', editingTaskId);
      }
      if (updated) void syncTaskScheduleToApple(updated, { dateKey: targetKey });
    } else {
      const id = generateTaskId();
      const dayList = taskMap[targetKey] ?? [];
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
        [targetKey]: [...insertNewActiveTask(dayActive, newTask), ...dayArchived],
      };
      persist(newMap);
      if (userId) {
        void supabase.from('tasks').insert(taskToDbRow(newTask, targetKey, userId));
      }
      void syncNewTaskToApple({
        label,
        dateKey: targetKey,
        mode: 'reminders-and-calendar',
        hour: saveHour,
        minute: saveMinute,
        location,
        priority: sheetPriority,
      }).then(ids => {
        if (!ids.appleReminderId && !ids.appleEventId) return;
        setTaskMap(prev => {
          const next = mergeAppleIdsIntoTaskMap(prev, targetKey, id, ids);
          AsyncStorage.setItem('@tasks', JSON.stringify(next));
          return next;
        });
      });
    }
    closeSheet();
  }

  if (!parsed) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#FF4D00" />
          <Text style={styles.backLabel}>BACK</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isToday =
    parsed.getDate() === today.getDate() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getFullYear() === today.getFullYear();

  const dayNum = parsed.getDate();
  const monthName = MONTH_NAMES[parsed.getMonth()];
  const dayName = DAY_NAMES[parsed.getDay()];

  const listHeader = (
    <>
      <View style={styles.dateStage}>
        {isToday && <Text style={styles.todayLabel}>TODAY</Text>}
        <Text style={styles.dayName}>{dayName}</Text>
        <View style={styles.dateBand}>
          <Text style={styles.dateNum}>{String(dayNum).padStart(2, '0')}</Text>
          <Text style={styles.dateMonth}>{monthName}</Text>
        </View>
      </View>
      <Text style={[styles.tasksHeading, editMode && styles.tasksHeadingEdit]}>
        {monthName} {formatOrdinal(dayNum)} TASKS
      </Text>
      {editMode && (
        <Text style={styles.editHint}>TAP A TASK TO EDIT · TAP − TO REMOVE</Text>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#FF4D00" />
          <Text style={styles.backLabel}>CALENDAR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setEditMode(v => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.editBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.editBtnText, editMode && styles.editBtnTextActive]}>
            {editMode ? 'DONE' : 'EDIT'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <DateTaskList
          dateKey={dateKey}
          taskMap={taskMap}
          onTaskMapChange={setTaskMap}
          userId={userId}
          listHeader={listHeader}
          onAddPress={() => openSheet(null)}
          onEditTask={task => openSheet(task)}
          editMode={editMode}
        />
      </View>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          style={styles.sheetKAV}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
            <Pressable style={styles.sheetCard} onPress={e => e.stopPropagation()}>
              <Text style={styles.sheetLabel}>
                {editingTaskId ? 'EDIT TASK' : 'NEW TASK'}
              </Text>
              <TextInput
                style={styles.sheetInput}
                value={sheetText}
                onChangeText={setSheetText}
                placeholder="TASK NAME..."
                placeholderTextColor="#C7C1B8"
                autoCapitalize="characters"
                returnKeyType="done"
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
                  <TouchableOpacity style={styles.sheetConfirm} onPress={confirmSheet} activeOpacity={0.85}>
                    <Text style={styles.sheetConfirmText}>
                      {editingTaskId ? 'SAVE TASK' : 'ADD TASK'}
                    </Text>
                  </TouchableOpacity>
                }
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F0EC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  editBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  editBtnText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
    color: '#8C857B',
    letterSpacing: 1.5,
  },
  editBtnTextActive: {
    color: '#FF4D00',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
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
  dateStage: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 28,
  },
  todayLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
    color: '#FF4D00',
    letterSpacing: 2,
    marginBottom: 10,
  },
  dayName: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    color: '#8C857B',
    letterSpacing: 2,
    marginBottom: 12,
  },
  dateBand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  dateNum: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 56,
    color: '#1A1714',
    lineHeight: 60,
  },
  dateMonth: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 14,
    color: '#FF4D00',
    letterSpacing: 2,
  },
  tasksHeading: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 10,
    color: '#8C857B',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  tasksHeadingEdit: {
    color: '#FF4D00',
  },
  editHint: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    color: '#8C857B',
    marginTop: -8,
    marginBottom: 12,
  },
  sheetKAV: { flex: 1 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheetCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  sheetLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 9,
    color: '#FF4D00',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sheetInput: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 13,
    color: '#1A1714',
    borderBottomWidth: 2,
    borderBottomColor: '#E5E1DA',
    paddingVertical: 10,
    marginBottom: 4,
  },
  sheetConfirm: {
    backgroundColor: '#FF4D00',
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  sheetConfirmText: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    color: '#FCFBF9',
    letterSpacing: 1,
  },
});
