import { useState, useCallback, useMemo } from 'react';
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
import { generateTaskId, insertNewActiveTask, type Priority, type TaskMap } from '@/lib/tasks-core';
import { DateTaskList } from '@/components/DateTaskList';

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function parseDateKey(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

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
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const dateKey = typeof dateParam === 'string' ? dateParam : '';

  const parsed = useMemo(() => parseDateKey(dateKey), [dateKey]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [taskMap, setTaskMap] = useState<TaskMap>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetText, setSheetText] = useState('');
  const [sheetPriority, setSheetPriority] = useState<Priority>('MEDIUM');

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

  function addTask(label: string, priority: Priority) {
    const allTasks = taskMap[dateKey] ?? [];
    const id = generateTaskId();
    const archived = allTasks.filter(t => t.archived);
    const active = allTasks.filter(t => !t.archived);
    const newMap = {
      ...taskMap,
      [dateKey]: [
        ...insertNewActiveTask(active, { id, label, done: false, archived: false, priority }),
        ...archived,
      ],
    };
    setTaskMap(newMap);
    AsyncStorage.setItem('@tasks', JSON.stringify(newMap));
    if (userId) {
      void supabase.from('tasks').insert({
        id,
        user_id: userId,
        date: dateKey,
        label,
        done: false,
        priority,
      });
    }
  }

  function openSheet() {
    setSheetText('');
    setSheetPriority('MEDIUM');
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  function confirmSheet() {
    const text = sheetText.trim();
    if (!text) {
      closeSheet();
      return;
    }
    addTask(text.toUpperCase(), sheetPriority);
    closeSheet();
  }

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
        <Text style={styles.editHint}>TAP − TO REMOVE TASKS</Text>
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
          onAddPress={openSheet}
          editMode={editMode}
        />
      </View>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          style={styles.sheetKAV}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
            <Pressable style={styles.sheetCard} onPress={() => {}}>
              <Text style={styles.sheetLabel}>NEW TASK</Text>
              <TextInput
                style={styles.sheetInput}
                value={sheetText}
                onChangeText={setSheetText}
                placeholder="TASK NAME..."
                placeholderTextColor="#C7C1B8"
                autoFocus
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={confirmSheet}
              />
              <View style={styles.priorityRow}>
                {(['LOW', 'MEDIUM', 'HIGH'] as Priority[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.priorityBtn, sheetPriority === p && styles.priorityBtnActive]}
                    onPress={() => setSheetPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityBtnText,
                        sheetPriority === p && styles.priorityBtnTextActive,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.sheetConfirm} onPress={confirmSheet} activeOpacity={0.85}>
                <Text style={styles.sheetConfirmText}>ADD TASK</Text>
              </TouchableOpacity>
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
    fontSize: 13,
    color: '#1A1714',
    letterSpacing: 2,
    marginBottom: 14,
  },
  dateBand: {
    backgroundColor: '#FF4D00',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
  },
  dateNum: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 72,
    lineHeight: 78,
    color: '#FCFBF9',
    letterSpacing: -2,
  },
  dateMonth: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 12,
    color: '#FCFBF9',
    letterSpacing: 2,
    marginTop: 8,
  },
  tasksHeading: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    color: '#FF4D00',
    letterSpacing: 1,
    marginBottom: 20,
  },
  tasksHeadingEdit: {
    marginBottom: 6,
  },
  editHint: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 10,
    color: '#8C857B',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  sheetKAV: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 23, 20, 0.45)',
  },
  sheetCard: {
    backgroundColor: '#FCFBF9',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1A1714',
    padding: 20,
    marginHorizontal: 8,
  },
  sheetLabel: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    color: '#FF4D00',
    letterSpacing: 2,
    marginBottom: 12,
  },
  sheetInput: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 14,
    color: '#1A1714',
    borderWidth: 2,
    borderColor: '#E5E1DA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#E5E1DA',
    borderRadius: 6,
    alignItems: 'center',
  },
  priorityBtnActive: {
    borderColor: '#FF4D00',
    backgroundColor: 'rgba(255, 77, 0, 0.08)',
  },
  priorityBtnText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 8,
    color: '#8C857B',
    letterSpacing: 1,
  },
  priorityBtnTextActive: {
    color: '#FF4D00',
  },
  sheetConfirm: {
    backgroundColor: '#FF4D00',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetConfirmText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 11,
    color: '#FCFBF9',
    letterSpacing: 2,
  },
});
