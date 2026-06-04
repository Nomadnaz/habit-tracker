import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
} from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_STEP_PX,
  COMPLETE_FADE_MS,
  COMPLETE_HOLD_MS,
  TASK_ROW_SLOT_PX,
  buildTaskList,
  LIST_MOVE_SPRING_MS,
  listMoveSpring,
  listMoveSpringDown,
  smoothListAnim,
  sortActiveTasks,
  completedTaskSinkIndex,
  insertNewActiveTask,
  type Task,
  type TaskMap,
} from '@/lib/tasks-core';
import {
  mergeAppleIdsIntoTaskMap,
  syncTaskDoneToApple,
  syncTaskRemovedFromApple,
} from '@/lib/apple-sync';
import { TaskRow } from '@/components/TaskRow';
import { DragTaskFloatingChip } from '@/components/DragTaskFloatingChip';
import { useTaskDragFloat } from '@/lib/task-drag-float';

type DateTaskListProps = {
  dateKey: string;
  taskMap: TaskMap;
  onTaskMapChange: (map: TaskMap) => void;
  userId: string | null;
  listHeader: ReactNode;
  onAddPress: () => void;
  onEditTask: (task: Task) => void;
  editMode: boolean;
};

export function DateTaskList({
  dateKey,
  taskMap,
  onTaskMapChange,
  userId,
  listHeader,
  onAddPress,
  onEditTask,
  editMode,
}: DateTaskListProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const { floatTop, floatLeft, startFloat, moveFloat, syncColumnLeft, setOverlayOrigin } =
    useTaskDragFloat();
  const taskMapRef = useRef<TaskMap>({});
  const editModeRef = useRef(editMode);
  const dateKeyRef = useRef(dateKey);
  const userIdRef = useRef<string | null>(null);
  const firstTaskWindowYRef = useRef(0);
  const dragStartIdxRef = useRef(0);
  const handleDragMoveRef = useRef((_x: number, _y: number) => {});
  const handleDragEndRef = useRef((_taskId: string) => {});
  const beginTaskDragRef = useRef((_id: string, _idx: number, _x: number, _y: number, _rowY: number) => {});
  const toggleTaskRef = useRef((_id: string) => {});
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const [completingPins, setCompletingPins] = useState<Map<string, number>>(() => new Map());
  const completingIdsRef = useRef(completingIds);
  const completeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [dragTargetIdx, setDragTargetIdx] = useState<number | null>(null);
  const dragTargetIdxRef = useRef<number | null>(null);
  const [taskColWidth, setTaskColWidth] = useState(300);
  const taskColLeftRef = useRef(24);
  const tasksScrollRef = useRef<GHScrollView>(null);
  const tasksScrollYRef = useRef(0);
  const tasksScrollWindowRef = useRef({ top: 0, bottom: 0 });
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollDirRef = useRef<'up' | 'down' | null>(null);
  const updateAutoScrollRef = useRef((_fingerY: number) => {});
  const stopAutoScrollRef = useRef(() => {});
  const moveTaskRef = useRef((_taskId: string, _targetIndex: number) => {});

  useEffect(() => { taskMapRef.current = taskMap; }, [taskMap]);
  useEffect(() => { dateKeyRef.current = dateKey; }, [dateKey]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { draggingTaskIdRef.current = draggingTaskId; }, [draggingTaskId]);
  useEffect(() => { completingIdsRef.current = completingIds; }, [completingIds]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  useEffect(() => {
    if (!editMode) return;
    stopAutoScrollRef.current();
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    dragTargetIdxRef.current = null;
    setDragTargetIdx(null);
  }, [editMode]);

  useEffect(() => {
    completeTimersRef.current.forEach(t => clearTimeout(t));
    completeTimersRef.current.clear();
    setCompletingIds(new Set());
    setCompletingPins(new Map());
  }, [dateKey]);

  useEffect(() => () => {
    completeTimersRef.current.forEach(t => clearTimeout(t));
    completeTimersRef.current.clear();
  }, []);

  const allTasks = taskMap[dateKey] ?? [];
  const activeTasks = allTasks.filter(t => !t.archived);
  const tasks = useMemo(
    () => buildTaskList(activeTasks, completingIds, completingPins),
    [activeTasks, completingIds, completingPins],
  );
  const draggingTask = tasks.find(t => t.id === draggingTaskId) ?? null;

  function persist(newMap: TaskMap) {
    onTaskMapChange(newMap);
    AsyncStorage.setItem('@tasks', JSON.stringify(newMap));
  }

  function clearCompletionTimer(id: string) {
    const t = completeTimersRef.current.get(id);
    if (t) clearTimeout(t);
    completeTimersRef.current.delete(id);
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

  function finishTaskCompletion(id: string) {
    clearCompletionTimer(id);
    const key = dateKeyRef.current;
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

  function toggleTask(id: string) {
    const key = dateKeyRef.current;
    const all = taskMapRef.current[key] ?? [];
    const task = all.find(t => t.id === id);
    if (!task || task.archived || completingIds.has(id)) return;
    const newDone = !task.done;
    const archivedTasks = all.filter(t => t.archived);
    const active = all.filter(t => !t.archived);
    const updatedActive = active.map(t => (t.id === id ? { ...t, done: newDone } : t));

    if (newDone) {
      const pinIdx = tasks.findIndex(t => t.id === id);
      persist({ ...taskMapRef.current, [key]: [...updatedActive, ...archivedTasks] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCompletingIds(prev => new Set(prev).add(id));
      setCompletingPins(prev => new Map(prev).set(id, pinIdx >= 0 ? pinIdx : updatedActive.length));
      clearCompletionTimer(id);
      completeTimersRef.current.set(
        id,
        setTimeout(() => finishTaskCompletion(id), COMPLETE_HOLD_MS + COMPLETE_FADE_MS),
      );
    } else {
      clearCompletionTimer(id);
      removeCompletingState(id);
      LayoutAnimation.configureNext(listMoveSpring);
      persist({
        ...taskMapRef.current,
        [key]: [...sortActiveTasks(updatedActive), ...archivedTasks],
      });
    }
    void supabase.from('tasks').update({ done: newDone }).eq('id', id);
    void syncTaskDoneToApple(task, newDone, {
      dateKey: key,
      hour: task.hour,
      minute: task.minute,
    }).then(newReminderId => {
      if (!newReminderId || newReminderId === task.appleReminderId) return;
      const next = mergeAppleIdsIntoTaskMap(taskMapRef.current, key, id, {
        appleReminderId: newReminderId,
      });
      persist(next);
    });
  }

  function archiveTask(taskId: string) {
    const key = dateKeyRef.current;
    const all = taskMapRef.current[key] ?? [];
    const task = all.find(t => t.id === taskId);
    const newMap = {
      ...taskMapRef.current,
      [key]: all.map(t => (t.id === taskId ? { ...t, archived: true } : t)),
    };
    persist(newMap);
    void supabase.from('tasks').update({ archived: true }).eq('id', taskId);
    if (task) void syncTaskRemovedFromApple(task);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function moveTaskToIndex(taskId: string, targetIndex: number) {
    const key = dateKeyRef.current;
    const all = taskMapRef.current[key] ?? [];
    const active = all.filter(t => !t.archived);
    const archived = all.filter(t => t.archived);
    const from = active.findIndex(t => t.id === taskId);
    const clampedTarget = Math.min(targetIndex, active.length - 1);
    if (from < 0 || clampedTarget < 0 || clampedTarget >= active.length || from === clampedTarget) return;
    const reordered = [...active];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(clampedTarget, 0, moved);
    persist({
      ...taskMapRef.current,
      [key]: [...sortActiveTasks(reordered), ...archived],
    });
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
    if (editModeRef.current || draggingTaskIdRef.current) return;
    draggingTaskIdRef.current = taskId;
    dragStartIdxRef.current = taskIndex;
    dragTargetIdxRef.current = taskIndex;
    setDragTargetIdx(taskIndex);
    startFloat(rowWinY, taskColLeftRef.current, pageY);
    setDraggingTaskId(taskId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  const endDragRef = useRef((taskId: string) => {
    stopAutoScrollRef.current();
    const target = dragTargetIdxRef.current;
    if (target !== null) {
      const key = dateKeyRef.current;
      const active = (taskMapRef.current[key] ?? []).filter(t => !t.archived);
      const from = active.findIndex(t => t.id === taskId);
      const to = target >= active.length ? active.length - 1 : Math.min(target, active.length - 1);
      if (from >= 0 && from !== to) {
        LayoutAnimation.configureNext(smoothListAnim);
        moveTaskRef.current(taskId, to);
      }
    }
    dragTargetIdxRef.current = null;
    setDragTargetIdx(null);
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
  });

  const measureTasksScroll = useCallback(() => {
    tasksScrollRef.current?.measureInWindow((_x, y, _w, h) => {
      tasksScrollWindowRef.current = { top: y, bottom: y + h };
    });
  }, []);

  useEffect(() => {
    beginTaskDragRef.current = beginTaskDrag;
    toggleTaskRef.current = toggleTask;
    moveTaskRef.current = moveTaskToIndex;

    handleDragMoveRef.current = (_pageX: number, pageY: number) => {
      if (!draggingTaskIdRef.current) return;
      moveFloat(pageY);
      syncColumnLeft(taskColLeftRef.current);
      updateAutoScrollRef.current(pageY);

      const key = dateKeyRef.current;
      const active = (taskMapRef.current[key] ?? []).filter(t => !t.archived);
      const target = computeDropIndexFromFinger(pageY, active.length);
      if (target !== dragTargetIdxRef.current) {
        dragTargetIdxRef.current = target;
        setDragTargetIdx(target);
      }
    };

    handleDragEndRef.current = (taskId: string) => {
      if (draggingTaskIdRef.current === taskId) endDragRef.current(taskId);
    };
  });

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

  return (
    <View style={styles.wrap}>
      {listHeader}

      <GHScrollView
        ref={tasksScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={draggingTaskId === null && !editMode}
        scrollEventThrottle={16}
        onScroll={e => {
          tasksScrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={e => {
          setTaskColWidth(e.nativeEvent.layout.width);
          measureTasksScroll();
          (tasksScrollRef.current as GHScrollView & { measureInWindow?: Function })?.measureInWindow?.(
            (x: number) => {
              taskColLeftRef.current = x;
            },
          );
        }}
      >
        {tasks.length === 0 ? (
          <TouchableOpacity style={styles.emptyWrap} onPress={onAddPress} activeOpacity={0.7}>
            <Text style={styles.emptyTitle}>NOTHING PLANNED</Text>
            <Text style={styles.emptyHint}>Tap here to add your first task.</Text>
          </TouchableOpacity>
        ) : (
          tasks.map((task, taskIndex) => (
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
              onFirstRowLayout={y => {
                firstTaskWindowYRef.current = y;
              }}
              onEditPress={editMode ? onEditTask : undefined}
            />
          ))
        )}
        {!editMode && draggingTaskId && dragTargetIdx === tasks.length && (
          <View style={styles.insertionEnd}>
            <View style={styles.insertionGhost} />
          </View>
        )}
        {!editMode && (
          <TouchableOpacity style={styles.addRow} onPress={onAddPress} activeOpacity={0.7}>
            <Text style={styles.addText}>+ ADD A NEW TASK...</Text>
          </TouchableOpacity>
        )}
      </GHScrollView>

      <DragTaskFloatingChip
        visible={!editMode && !!draggingTask}
        label={draggingTask?.label ?? ''}
        width={taskColWidth}
        top={floatTop}
        left={floatLeft}
        onOverlayOrigin={setOverlayOrigin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
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
  insertionEnd: {},
  insertionGhost: {
    height: TASK_ROW_SLOT_PX - 6,
    marginBottom: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF4D00',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 77, 0, 0.06)',
  },
  addRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E1DA',
    paddingTop: 16,
    marginTop: 4,
  },
  addText: {
    fontFamily: 'PixeloidSans_700Bold',
    fontSize: 13,
    color: '#FF4D00',
    letterSpacing: 0.5,
  },
});
