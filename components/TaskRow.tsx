import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  COMPLETE_FADE_MS,
  COMPLETE_HOLD_MS,
  TASK_LABEL_COLOR_ACTIVE,
  TASK_LABEL_COLOR_DONE,
  TASK_ROW_DONE_OPACITY,
  TASK_ROW_SLOT_PX,
  type Task,
  taskIndexColor,
} from '@/lib/tasks-core';

export function InsertionGhost() {
  return <View style={styles.insertionGhost} />;
}

type TaskRowProps = {
  task: Task;
  taskIndex: number;
  isDragged: boolean;
  isCompleting: boolean;
  showGhostHere: boolean;
  draggingTaskIdRef: MutableRefObject<string | null>;
  completingIdsRef: MutableRefObject<Set<string>>;
  beginDragRef: MutableRefObject<(id: string, idx: number, x: number, y: number, rowWinY: number) => void>;
  dragMoveRef: MutableRefObject<(x: number, y: number) => void>;
  dragEndRef: MutableRefObject<(id: string) => void>;
  toggleTaskRef: MutableRefObject<(id: string) => void>;
  onFirstRowLayout?: (y: number) => void;
  editMode?: boolean;
  onRemove?: (id: string) => void;
};

export function TaskRow({
  task,
  taskIndex,
  isDragged,
  isCompleting,
  showGhostHere,
  draggingTaskIdRef,
  completingIdsRef,
  beginDragRef,
  dragMoveRef,
  dragEndRef,
  toggleTaskRef,
  onFirstRowLayout,
  editMode = false,
  onRemove,
}: TaskRowProps) {
  const rowRef = useRef<View>(null);
  const completeTint = useRef(new Animated.Value(task.done ? 1 : 0)).current;

  useEffect(() => {
    if (isCompleting) {
      completeTint.setValue(0);
      Animated.sequence([
        Animated.delay(COMPLETE_HOLD_MS),
        Animated.timing(completeTint, {
          toValue: 1,
          duration: COMPLETE_FADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }
    if (!task.done) {
      Animated.timing(completeTint, {
        toValue: 0,
        duration: COMPLETE_FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      return;
    }
    completeTint.setValue(1);
  }, [isCompleting, task.done, completeTint]);

  const labelColor = completeTint.interpolate({
    inputRange: [0, 1],
    outputRange: [TASK_LABEL_COLOR_ACTIVE, TASK_LABEL_COLOR_DONE],
  });
  const rowFadeOpacity = completeTint.interpolate({
    inputRange: [0, 1],
    outputRange: [1, TASK_ROW_DONE_OPACITY],
  });

  const gesture = useMemo(() => {
    if (editMode) return Gesture.Tap().enabled(false);

    const pan = Gesture.Pan()
      .activateAfterLongPress(250)
      .onStart(e => {
        if (completingIdsRef.current.has(task.id)) return;
        const fingerY = e.absoluteY;
        rowRef.current?.measureInWindow((_x, rowY) => {
          beginDragRef.current(task.id, taskIndex, e.absoluteX, fingerY, rowY);
        });
      })
      .onUpdate(e => {
        dragMoveRef.current(e.absoluteX, e.absoluteY);
      })
      .onEnd(() => {
        dragEndRef.current(task.id);
      })
      .onFinalize(() => {
        if (draggingTaskIdRef.current === task.id) dragEndRef.current(task.id);
      });

    const tap = Gesture.Tap().maxDuration(220).onEnd(() => {
      if (draggingTaskIdRef.current || completingIdsRef.current.has(task.id)) return;
      toggleTaskRef.current(task.id);
    });

    return Gesture.Exclusive(pan, tap);
  }, [editMode, task.id, taskIndex, beginDragRef, dragMoveRef, dragEndRef, draggingTaskIdRef, completingIdsRef, toggleTaskRef]);

  const rowBody = (
    <Animated.View
      style={[
        styles.taskRow,
        !editMode && (task.done || isCompleting) && { opacity: rowFadeOpacity },
      ]}
    >
      <View style={styles.taskMain}>
        <View style={[styles.checkbox, task.done && styles.checkboxDone, editMode && styles.checkboxMuted]}>
          {task.done && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.taskLabelWrap}>
          <Animated.Text
            style={[
              styles.taskLabel,
              { color: labelColor },
              task.done && styles.taskLabelDone,
            ]}
          >
            {task.label}
          </Animated.Text>
          {task.priority && !task.done && !editMode && (
            <Text style={[styles.priorityTag, styles[`priority_${task.priority}`]]}>
              {task.priority}
            </Text>
          )}
        </View>
      </View>
      {editMode ? (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => onRemove?.(task.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="minus-circle" size={26} color="#E03030" />
        </TouchableOpacity>
      ) : (
        <View style={styles.priorityIndexWrap}>
          <Text style={[styles.priorityIndexText, { color: taskIndexColor(taskIndex) }]}>
            {taskIndex + 1}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  return (
    <View
      ref={rowRef}
      onLayout={() => {
        if (taskIndex !== 0 || !onFirstRowLayout) return;
        rowRef.current?.measureInWindow((_x, y) => onFirstRowLayout(y));
      }}
    >
      {!editMode && !isDragged && showGhostHere && <InsertionGhost />}
      {editMode ? (
        rowBody
      ) : (
        <GestureDetector gesture={gesture}>
          <View collapsable={false}>
            {isDragged ? <View style={styles.dragRowSpacer} /> : rowBody}
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  insertionGhost: {
    height: TASK_ROW_SLOT_PX - 6,
    marginBottom: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF4D00',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 77, 0, 0.06)',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#1A1714',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    flexShrink: 0,
  },
  checkboxDone: {
    backgroundColor: '#FF4D00',
    borderColor: '#FF4D00',
  },
  checkmark: {
    color: '#FCFBF9',
    fontSize: 14,
    fontWeight: 'bold',
  },
  taskLabelWrap: { flex: 1 },
  taskLabel: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 12,
    color: '#000000',
    lineHeight: 18,
  },
  taskLabelDone: {
    textDecorationLine: 'line-through',
  },
  priorityTag: {
    fontFamily: 'PixeloidSans_400Regular',
    fontSize: 8,
    marginTop: 4,
    letterSpacing: 1,
  },
  priority_HIGH: { color: '#E03030' },
  priority_MEDIUM: { color: '#8C857B' },
  priority_LOW: { color: '#4A9B6F' },
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
  dragRowSpacer: {
    height: 0,
    marginBottom: 0,
  },
  checkboxMuted: {
    opacity: 0.45,
  },
  removeBtn: {
    marginLeft: 8,
    padding: 2,
  },
});
